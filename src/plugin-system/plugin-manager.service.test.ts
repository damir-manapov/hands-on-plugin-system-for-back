import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { EventEmitter } from "node:events";
import { PluginManagerService } from "./plugin-manager.service.js";
import { PluginSystemModule } from "./plugin-system.module.js";
import { S3Module } from "../services/s3/s3.module.js";
import { DatabaseModule } from "../services/database/database.module.js";
import { KafkaModule } from "../services/kafka/kafka.module.js";
import type { Plugin, PluginMetadata } from "../types/plugin.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url as string);
const __dirname = dirname(__filename);
// Test file is in src/plugin-system/, plugins are in project root
const pluginsDir = join(__dirname, "../../plugins");

describe("PluginManagerService", () => {
  let pluginManager: PluginManagerService;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>>;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [S3Module, DatabaseModule, KafkaModule, PluginSystemModule],
    });
    const module = await moduleBuilder.compile();

    moduleRef = module;
    pluginManager = module.get<PluginManagerService>(PluginManagerService);
  });

  afterEach(async () => {
    await pluginManager.unloadAll();
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it("should load a plugin", async () => {
    const pluginPath = join(pluginsDir, "example-plugin-1.js");
    const plugin = await pluginManager.loadPlugin(pluginPath);

    expect(plugin).toBeDefined();
    expect(plugin.metadata.name).toBe("example-plugin-1");
    expect(pluginManager.getPlugin("example-plugin-1")).toBe(plugin);
  });

  it("should unload a plugin", async () => {
    const pluginPath = join(pluginsDir, "example-plugin-1.js");
    await pluginManager.loadPlugin(pluginPath);

    await pluginManager.unloadPlugin("example-plugin-1");

    expect(pluginManager.getPlugin("example-plugin-1")).toBeUndefined();
  });

  it("should get all plugins", async () => {
    const plugin1Path = join(pluginsDir, "example-plugin-1.js");
    const plugin2Path = join(pluginsDir, "example-plugin-2.js");

    await pluginManager.loadPlugin(plugin1Path);
    await pluginManager.loadPlugin(plugin2Path);

    const plugins = pluginManager.getAllPlugins();
    expect(plugins).toHaveLength(2);
    expect(plugins.map((p) => p.metadata.name)).toContain("example-plugin-1");
    expect(plugins.map((p) => p.metadata.name)).toContain("example-plugin-2");
  });

  it("should emit events when loading plugins", async () => {
    const pluginPath = join(pluginsDir, "example-plugin-1.js");
    let loadedPlugin: Plugin | null = null;

    (pluginManager as EventEmitter).on("pluginLoaded", (plugin: Plugin) => {
      loadedPlugin = plugin;
    });

    await pluginManager.loadPlugin(pluginPath);

    expect(loadedPlugin).toBeDefined();
    expect(loadedPlugin).not.toBeNull();
    expect(loadedPlugin!.metadata.name).toBe("example-plugin-1");
  });

  it("should emit events when unloading plugins", async () => {
    const pluginPath = join(pluginsDir, "example-plugin-1.js");
    await pluginManager.loadPlugin(pluginPath);

    let unloadedMetadata: PluginMetadata | null = null;

    (pluginManager as EventEmitter).on("pluginUnloaded", (metadata: PluginMetadata) => {
      unloadedMetadata = metadata;
    });

    await pluginManager.unloadPlugin("example-plugin-1");

    expect(unloadedMetadata).toBeDefined();
    expect(unloadedMetadata).not.toBeNull();
    expect(unloadedMetadata!.name).toBe("example-plugin-1");
  });
});
