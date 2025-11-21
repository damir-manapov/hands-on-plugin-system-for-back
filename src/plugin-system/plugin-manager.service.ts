import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
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
} from "../errors/plugin-errors.js";

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

  private createPluginContext(pluginName: string, dependencies: string[]): PluginContext {
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
    };

    this.pluginContexts.set(pluginName, context);
    return context;
  }

  async loadPlugin(pluginPath: string): Promise<Plugin> {
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

      this.validateDependencies(plugin);

      this.pluginDependencies.set(name, new Set(dependencies));

      const context = this.createPluginContext(name, dependencies);

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
        error instanceof InvalidPluginFormatError
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

  async reloadPlugin(name: string): Promise<Plugin> {
    const pluginPath = this.pluginPaths.get(name);

    if (!pluginPath) {
      throw new PluginNotFoundError(name);
    }

    await this.unloadPlugin(name);

    return this.loadPlugin(pluginPath);
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
              await this.loadPlugin(path);
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
