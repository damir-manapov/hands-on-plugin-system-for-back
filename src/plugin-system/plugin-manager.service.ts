import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { Plugin, PluginMetadata, PluginContext, PluginEventBus } from "../types/plugin.js";
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DependencyNotFoundError,
  SelfDependencyError,
  CircularDependencyError,
  UndeclaredDependencyError,
  InvalidPluginFormatError,
  PluginLoadError,
  PluginUnloadError,
  DependencyResolutionError,
  PluginNotFoundError,
  InvalidNamingConventionError,
} from "../errors/plugin-errors.js";
import {
  validatePluginName,
  validateTableName,
  validateTopicName,
  validateBucketName,
  validateResourceNames,
} from "../utils/naming-validation.js";
import { S3Service } from "../services/s3/s3.service.js";
import { DatabaseService } from "../services/database/database.service.js";
import { KafkaService } from "../services/kafka/kafka.service.js";
import { DatabaseRepositoryImpl } from "../repositories/database/database.repository.impl.js";
import { KafkaRepositoryImpl } from "../repositories/kafka/kafka.repository.impl.js";
import { S3RepositoryImpl } from "../repositories/s3/s3.repository.impl.js";

export interface PluginResourceOverrides {
  allowedTables?: string[];
  allowedTopics?: string[];
  allowedBuckets?: string[];
  // Map plugin resource names to actual resource names
  // e.g., { "users": "custom_users_table" } means when plugin uses "users", it accesses "custom_users_table"
  tableNameMap?: Record<string, string>;
  topicNameMap?: Record<string, string>;
  bucketNameMap?: Record<string, string>;
}

export interface PluginManagerEvents {
  pluginLoaded: (plugin: Plugin) => void;
  pluginUnloaded: (metadata: PluginMetadata) => void;
  pluginError: (error: Error, metadata?: PluginMetadata) => void;
}

export declare interface PluginManagerService {
  on<U extends keyof PluginManagerEvents>(event: U, listener: PluginManagerEvents[U]): this;
  emit<U extends keyof PluginManagerEvents>(
    event: U,
    ...args: Parameters<PluginManagerEvents[U]>
  ): boolean;
}

@Injectable()
export class PluginManagerService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginManagerService.name);
  private plugins: Map<string, Plugin> = new Map();
  private pluginPaths: Map<string, string> = new Map();
  private pluginEventBus: EventEmitter = new EventEmitter();
  private pluginListeners: Map<string, Map<string, Set<(data?: unknown) => void>>> = new Map();
  private pluginDependencies: Map<string, Set<string>> = new Map();
  private pluginContexts: Map<string, PluginContext> = new Map();
  private invalidatedPlugins: Set<string> = new Set();
  private pluginsDirectory?: string;
  private pluginResourceOverrides: Map<string, PluginResourceOverrides> = new Map();
  // Store name mappings for each plugin (plugin name -> resource type -> original name -> mapped name)
  private pluginResourceNameMaps: Map<
    string,
    {
      tables: Map<string, string>;
      topics: Map<string, string>;
      buckets: Map<string, string>;
    }
  > = new Map();

  constructor(
    @Optional() private readonly s3Service?: S3Service,
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional() private readonly kafkaService?: KafkaService
  ) {
    super();
  }

  setPluginsDirectory(directory: string): void {
    this.pluginsDirectory = directory;
  }

  private validateDependencies(plugin: Plugin): void {
    const dependencies = plugin.metadata.dependencies || [];
    const pluginName = plugin.metadata.name;

    for (const depName of dependencies) {
      if (!this.plugins.has(depName)) {
        throw new DependencyNotFoundError(pluginName, depName);
      }

      if (depName === pluginName) {
        throw new SelfDependencyError(pluginName);
      }
    }

    this.checkCircularDependencies(pluginName, dependencies, new Set([pluginName]));
  }

  private validateNamingConventions(
    metadata: PluginMetadata,
    resourceOverrides?: PluginResourceOverrides
  ): void {
    const pluginName = metadata.name;

    // Validate plugin name
    try {
      validatePluginName(pluginName);
    } catch (error) {
      throw new InvalidNamingConventionError(
        pluginName,
        "plugin name",
        error instanceof Error ? error.message : String(error)
      );
    }

    // Validate dependency names
    const dependencies = metadata.dependencies || [];
    for (const depName of dependencies) {
      try {
        validatePluginName(depName);
      } catch (error) {
        throw new InvalidNamingConventionError(
          pluginName,
          "dependency name",
          `Dependency '${depName}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate resource names from metadata or overrides
    const allowedTables = resourceOverrides?.allowedTables || metadata.allowedTables || [];
    const allowedTopics = resourceOverrides?.allowedTopics || metadata.allowedTopics || [];
    const allowedBuckets = resourceOverrides?.allowedBuckets || metadata.allowedBuckets || [];

    // Validate table names
    try {
      validateResourceNames(allowedTables, validateTableName, "table");
    } catch (error) {
      throw new InvalidNamingConventionError(
        pluginName,
        "table",
        error instanceof Error ? error.message : String(error)
      );
    }

    // Validate topic names
    try {
      validateResourceNames(allowedTopics, validateTopicName, "topic");
    } catch (error) {
      throw new InvalidNamingConventionError(
        pluginName,
        "topic",
        error instanceof Error ? error.message : String(error)
      );
    }

    // Validate bucket names
    try {
      validateResourceNames(allowedBuckets, validateBucketName, "bucket");
    } catch (error) {
      throw new InvalidNamingConventionError(
        pluginName,
        "bucket",
        error instanceof Error ? error.message : String(error)
      );
    }

    // Validate name mappings
    const tableNameMap = resourceOverrides?.tableNameMap || {};
    const topicNameMap = resourceOverrides?.topicNameMap || {};
    const bucketNameMap = resourceOverrides?.bucketNameMap || {};

    // Validate mapped table names (values in the map)
    for (const [originalName, mappedName] of Object.entries(tableNameMap)) {
      try {
        validateTableName(originalName);
        validateTableName(mappedName);
      } catch (error) {
        throw new InvalidNamingConventionError(
          pluginName,
          "table name mapping",
          `Mapping '${originalName}' -> '${mappedName}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate mapped topic names
    for (const [originalName, mappedName] of Object.entries(topicNameMap)) {
      try {
        validateTopicName(originalName);
        validateTopicName(mappedName);
      } catch (error) {
        throw new InvalidNamingConventionError(
          pluginName,
          "topic name mapping",
          `Mapping '${originalName}' -> '${mappedName}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate mapped bucket names
    for (const [originalName, mappedName] of Object.entries(bucketNameMap)) {
      try {
        validateBucketName(originalName);
        validateBucketName(mappedName);
      } catch (error) {
        throw new InvalidNamingConventionError(
          pluginName,
          "bucket name mapping",
          `Mapping '${originalName}' -> '${mappedName}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private checkCircularDependencies(
    pluginName: string,
    dependencies: string[],
    visited: Set<string>
  ): void {
    for (const depName of dependencies) {
      if (visited.has(depName)) {
        throw new CircularDependencyError(pluginName, Array.from(visited));
      }

      const depDependencies = this.pluginDependencies.get(depName);
      if (depDependencies && depDependencies.size > 0) {
        const newVisited = new Set(visited);
        newVisited.add(depName);
        this.checkCircularDependencies(pluginName, Array.from(depDependencies), newVisited);
      }
    }
  }

  /**
   * Prefix resource names with plugin slug
   */
  private prefixResources(resources: string[], pluginSlug: string): string[] {
    return resources.map((resource) => `${pluginSlug}_${resource}`);
  }

  /**
   * Apply name mappings to resources
   * If a mapping exists, use the mapped name; otherwise use the original name
   */
  private applyNameMappings(
    resources: string[],
    nameMap: Record<string, string> | undefined
  ): string[] {
    if (!nameMap) {
      return resources;
    }
    return resources.map((resource) => nameMap[resource] || resource);
  }

  private createPluginContext(
    pluginName: string,
    dependencies: string[],
    metadata: PluginMetadata,
    resourceOverrides?: PluginResourceOverrides
  ): PluginContext {
    // Use resource overrides if provided, otherwise use plugin metadata
    const overrides = resourceOverrides || this.pluginResourceOverrides.get(pluginName);
    const rawTables =
      overrides?.allowedTables !== undefined
        ? overrides.allowedTables
        : metadata.allowedTables || [];
    const rawTopics =
      overrides?.allowedTopics !== undefined
        ? overrides.allowedTopics
        : metadata.allowedTopics || [];
    const rawBuckets =
      overrides?.allowedBuckets !== undefined
        ? overrides.allowedBuckets
        : metadata.allowedBuckets || [];

    // Apply name mappings if provided
    const mappedTables = this.applyNameMappings(rawTables, overrides?.tableNameMap);
    const mappedTopics = this.applyNameMappings(rawTopics, overrides?.topicNameMap);
    const mappedBuckets = this.applyNameMappings(rawBuckets, overrides?.bucketNameMap);

    // Store name mappings for this plugin
    const tableMap = new Map<string, string>();
    const topicMap = new Map<string, string>();
    const bucketMap = new Map<string, string>();

    if (overrides?.tableNameMap) {
      for (const [original, mapped] of Object.entries(overrides.tableNameMap)) {
        tableMap.set(original.toLowerCase(), mapped);
      }
    }
    if (overrides?.topicNameMap) {
      for (const [original, mapped] of Object.entries(overrides.topicNameMap)) {
        topicMap.set(original, mapped);
      }
    }
    if (overrides?.bucketNameMap) {
      for (const [original, mapped] of Object.entries(overrides.bucketNameMap)) {
        bucketMap.set(original, mapped);
      }
    }

    this.pluginResourceNameMaps.set(pluginName, {
      tables: tableMap,
      topics: topicMap,
      buckets: bucketMap,
    });

    // Plugin manager prefixes resources before passing to repositories
    const allowedTables = this.prefixResources(mappedTables, pluginName);
    const allowedTopics = this.prefixResources(mappedTopics, pluginName);
    const allowedBuckets = this.prefixResources(mappedBuckets, pluginName);

    const s3Repository = this.s3Service
      ? new S3RepositoryImpl(this.s3Service, allowedBuckets, pluginName, bucketMap)
      : undefined;
    const databaseRepository = this.databaseService
      ? new DatabaseRepositoryImpl(this.databaseService, allowedTables, pluginName, tableMap)
      : undefined;
    const kafkaRepository = this.kafkaService
      ? new KafkaRepositoryImpl(this.kafkaService, allowedTopics, pluginName, topicMap)
      : undefined;

    const dependencyPlugins = new Map<string, Plugin>();
    for (const depName of dependencies) {
      const plugin = this.plugins.get(depName);
      if (plugin) {
        dependencyPlugins.set(depName, plugin);
      }
    }

    const checkValid = () => {
      if (this.invalidatedPlugins.has(pluginName)) {
        throw new Error(`Plugin '${pluginName}' has been unloaded. Context is no longer valid.`);
      }
    };

    const eventBus: PluginEventBus = {
      emit: (event: string, data?: unknown) => {
        checkValid();
        this.pluginEventBus.emit(event, { source: pluginName, data });
      },
      on: (event: string, listener: (data?: unknown) => void) => {
        checkValid();
        const wrappedListener = (payload: unknown) => {
          const eventPayload = payload as { source: string; data?: unknown };
          if (eventPayload.source && eventPayload.source !== pluginName) {
            listener(eventPayload.data);
          }
        };
        this.pluginEventBus.on(event, wrappedListener);

        if (!this.pluginListeners.has(pluginName)) {
          this.pluginListeners.set(pluginName, new Map());
        }
        const pluginListeners = this.pluginListeners.get(pluginName)!;
        if (!pluginListeners.has(event)) {
          pluginListeners.set(event, new Set());
        }
        pluginListeners.get(event)!.add(wrappedListener);
      },
      off: (_event: string, _listener: (data?: unknown) => void) => {
        checkValid();
        const pluginListeners = this.pluginListeners.get(pluginName);
        if (pluginListeners) {
          const listeners = pluginListeners.get(_event);
          if (listeners) {
            listeners.forEach((l) => {
              this.pluginEventBus.off(_event, l);
            });
            listeners.clear();
          }
        }
      },
      once: (event: string, listener: (data?: unknown) => void) => {
        checkValid();
        const wrappedListener = (payload: unknown) => {
          const eventPayload = payload as { source: string; data?: unknown };
          if (eventPayload.source && eventPayload.source !== pluginName) {
            listener(eventPayload.data);
          }
        };
        this.pluginEventBus.once(event, wrappedListener);
      },
    };

    const context: PluginContext = {
      eventBus,
      getDependency: (name: string) => {
        checkValid();
        if (!dependencies.includes(name)) {
          throw new UndeclaredDependencyError(pluginName, name);
        }
        return dependencyPlugins.get(name);
      },
      getDependencies: () => {
        checkValid();
        return dependencyPlugins;
      },
      // Restricted repositories
      s3: s3Repository,
      database: databaseRepository,
      kafka: kafkaRepository,
    };

    this.pluginContexts.set(pluginName, context);
    return context;
  }

  async loadPlugin(
    pluginPath: string,
    resourceOverrides?: PluginResourceOverrides
  ): Promise<Plugin> {
    try {
      const moduleUrl = pathToFileURL(pluginPath).href;
      const module = await import(moduleUrl);

      const plugin: Plugin = module.default || module.plugin;

      if (!plugin || !plugin.metadata) {
        throw new InvalidPluginFormatError(pluginPath, "missing plugin or metadata");
      }

      const { name } = plugin.metadata;
      const dependencies = plugin.metadata.dependencies || [];

      if (this.plugins.has(name)) {
        await this.unloadPlugin(name);
      }

      // Validate naming conventions before proceeding
      this.validateNamingConventions(plugin.metadata, resourceOverrides);

      this.validateDependencies(plugin);

      this.pluginDependencies.set(name, new Set(dependencies));

      // Store resource overrides if provided
      if (resourceOverrides) {
        this.pluginResourceOverrides.set(name, resourceOverrides);
      }

      const context = this.createPluginContext(
        name,
        dependencies,
        plugin.metadata,
        resourceOverrides
      );

      if (plugin.initialize) {
        await plugin.initialize(context);
      }

      this.plugins.set(name, plugin);
      this.pluginPaths.set(name, pluginPath);

      this.emit("pluginLoaded", plugin);
      this.logger.log(`Plugin loaded: ${name} v${plugin.metadata.version}`);

      return plugin;
    } catch (error) {
      if (
        error instanceof DependencyNotFoundError ||
        error instanceof SelfDependencyError ||
        error instanceof CircularDependencyError ||
        error instanceof InvalidPluginFormatError ||
        error instanceof InvalidNamingConventionError
      ) {
        this.emit("pluginError", error, undefined);
        throw error;
      }

      const err =
        error instanceof Error
          ? new PluginLoadError(pluginPath, error)
          : new PluginLoadError(pluginPath, new Error(String(error)));
      this.emit("pluginError", err);
      throw err;
    }
  }

  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);

    if (!plugin) {
      return;
    }

    try {
      this.invalidatedPlugins.add(name);

      if (plugin.cleanup) {
        await plugin.cleanup();
      }

      const pluginListeners = this.pluginListeners.get(name);
      if (pluginListeners) {
        for (const [event, listeners] of pluginListeners.entries()) {
          for (const listener of listeners) {
            this.pluginEventBus.off(event, listener);
          }
        }
        this.pluginListeners.delete(name);
      }

      this.pluginDependencies.delete(name);
      this.pluginContexts.delete(name);
      this.plugins.delete(name);
      this.pluginPaths.delete(name);
      this.invalidatedPlugins.delete(name);
      // Note: We keep resource overrides even after unload so they persist on reload

      this.emit("pluginUnloaded", plugin.metadata);
      this.logger.log(`Plugin unloaded: ${name}`);
    } catch (error) {
      const err =
        error instanceof Error
          ? new PluginUnloadError(name, error)
          : new PluginUnloadError(name, new Error(String(error)));
      this.emit("pluginError", err, plugin.metadata);
      throw err;
    }
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  async reloadPlugin(name: string, resourceOverrides?: PluginResourceOverrides): Promise<Plugin> {
    const pluginPath = this.pluginPaths.get(name);

    if (!pluginPath) {
      throw new PluginNotFoundError(name);
    }

    // Preserve existing overrides if new ones not provided
    const overrides = resourceOverrides || this.pluginResourceOverrides.get(name);

    await this.unloadPlugin(name);

    return this.loadPlugin(pluginPath, overrides);
  }

  async loadPluginsFromDirectory(directory: string): Promise<void> {
    try {
      const files = await readdir(directory);
      const pluginFiles = files.filter(
        (file) => extname(file) === ".js" || extname(file) === ".mjs"
      );

      const pluginModules: Array<{ path: string; plugin: Plugin }> = [];

      for (const file of pluginFiles as string[]) {
        const filePath = join(directory, file);
        const stats = await stat(filePath);

        if (stats.isFile()) {
          try {
            const moduleUrl = pathToFileURL(filePath).href;
            const module = await import(moduleUrl);
            const plugin: Plugin = module.default || module.plugin;

            if (plugin && plugin.metadata) {
              pluginModules.push({ path: filePath, plugin });
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Failed to parse plugin ${file}: ${err.message}`);
          }
        }
      }

      const loadedPlugins = new Set<string>();
      const remainingPlugins = new Map(pluginModules.map((p) => [p.plugin.metadata.name, p]));

      while (remainingPlugins.size > 0) {
        let loadedAny = false;

        for (const [name, { path, plugin }] of remainingPlugins.entries()) {
          const dependencies = plugin.metadata.dependencies || [];
          const allDependenciesLoaded = dependencies.every((dep) => loadedPlugins.has(dep));

          if (allDependenciesLoaded) {
            try {
              // Use any stored overrides for this plugin
              const overrides = this.pluginResourceOverrides.get(name);
              await this.loadPlugin(path, overrides);
              loadedPlugins.add(name);
              remainingPlugins.delete(name);
              loadedAny = true;
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              this.logger.error(`Failed to load plugin ${name}: ${err.message}`);
              remainingPlugins.delete(name);
            }
          }
        }

        if (!loadedAny && remainingPlugins.size > 0) {
          throw new DependencyResolutionError(Array.from(remainingPlugins.keys()));
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Failed to load plugins from directory: ${err.message}`);
    }
  }

  async unloadAll(): Promise<void> {
    const pluginNames = Array.from(this.plugins.keys());
    await Promise.all(pluginNames.map((name) => this.unloadPlugin(name)));
  }

  getPluginPath(name: string): string | undefined {
    return this.pluginPaths.get(name);
  }

  /**
   * Set resource overrides for a plugin (tables, topics, buckets)
   * These overrides will be used when loading/reloading the plugin
   */
  setPluginResourceOverrides(name: string, overrides: PluginResourceOverrides): void {
    this.pluginResourceOverrides.set(name, overrides);
    // If plugin is already loaded, reload it with new overrides
    if (this.plugins.has(name)) {
      this.logger.debug(`Resource overrides updated for plugin '${name}', reloading...`);
      this.reloadPlugin(name, overrides).catch((error) => {
        this.logger.error(`Failed to reload plugin '${name}' with new overrides: ${error}`);
      });
    }
  }

  /**
   * Get resource overrides for a plugin
   */
  getPluginResourceOverrides(name: string): PluginResourceOverrides | undefined {
    return this.pluginResourceOverrides.get(name);
  }

  /**
   * Clear resource overrides for a plugin
   */
  clearPluginResourceOverrides(name: string): void {
    this.pluginResourceOverrides.delete(name);
    // If plugin is already loaded, reload it without overrides (use metadata defaults)
    if (this.plugins.has(name)) {
      this.logger.debug(`Resource overrides cleared for plugin '${name}', reloading...`);
      this.reloadPlugin(name).catch((error) => {
        this.logger.error(`Failed to reload plugin '${name}' after clearing overrides: ${error}`);
      });
    }
  }

  findPluginByPath(path: string): string | undefined {
    for (const [name, pluginPath] of this.pluginPaths.entries()) {
      if (pluginPath === path) {
        return name;
      }
    }
    return undefined;
  }

  async onModuleInit(): Promise<void> {
    if (this.pluginsDirectory) {
      try {
        await this.loadPluginsFromDirectory(this.pluginsDirectory);
        this.logger.log(`Loaded plugins from ${this.pluginsDirectory}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Failed to load plugins: ${err.message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.unloadAll();
    this.logger.log("All plugins unloaded");
  }
}
