import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PluginManager } from "../src/core/plugin-manager.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("PluginManager", () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager();
  });

  afterEach(async () => {
    await pluginManager.unloadAll();
  });

  it("should load a plugin", async () => {
    const pluginPath = join(__dirname, "../plugins/example-plugin-1.js");
    const plugin = await pluginManager.loadPlugin(pluginPath);

    expect(plugin).toBeDefined();
    expect(plugin.metadata.name).toBe("example-plugin-1");
    expect(pluginManager.getPlugin("example-plugin-1")).toBe(plugin);
  });

  it("should unload a plugin", async () => {
    const pluginPath = join(__dirname, "../plugins/example-plugin-1.js");
    await pluginManager.loadPlugin(pluginPath);

    await pluginManager.unloadPlugin("example-plugin-1");

    expect(pluginManager.getPlugin("example-plugin-1")).toBeUndefined();
  });

  it("should get all plugins", async () => {
    const plugin1Path = join(__dirname, "../plugins/example-plugin-1.js");
    const plugin2Path = join(__dirname, "../plugins/example-plugin-2.js");

    await pluginManager.loadPlugin(plugin1Path);
    await pluginManager.loadPlugin(plugin2Path);

    const plugins = pluginManager.getAllPlugins();
    expect(plugins).toHaveLength(2);
    expect(plugins.map((p) => p.metadata.name)).toContain("example-plugin-1");
    expect(plugins.map((p) => p.metadata.name)).toContain("example-plugin-2");
  });

  it("should emit events when loading plugins", async () => {
    const pluginPath = join(__dirname, "../plugins/example-plugin-1.js");
    let loadedPlugin = null;

    pluginManager.on("pluginLoaded", (plugin) => {
      loadedPlugin = plugin;
    });

    await pluginManager.loadPlugin(pluginPath);

    expect(loadedPlugin).toBeDefined();
    expect(loadedPlugin?.metadata.name).toBe("example-plugin-1");
  });

  it("should emit events when unloading plugins", async () => {
    const pluginPath = join(__dirname, "../plugins/example-plugin-1.js");
    await pluginManager.loadPlugin(pluginPath);

    let unloadedMetadata = null;

    pluginManager.on("pluginUnloaded", (metadata) => {
      unloadedMetadata = metadata;
    });

    await pluginManager.unloadPlugin("example-plugin-1");

    expect(unloadedMetadata).toBeDefined();
    expect(unloadedMetadata?.name).toBe("example-plugin-1");
  });
});
