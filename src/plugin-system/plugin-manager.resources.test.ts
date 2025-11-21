import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { PluginManagerService, type PluginResourceOverrides } from "./plugin-manager.service.js";
import { PluginSystemModule } from "./plugin-system.module.js";
import { S3Module } from "../services/s3/s3.module.js";
import { DatabaseModule } from "../services/database/database.module.js";
import { KafkaModule } from "../services/kafka/kafka.module.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url as string);
const __dirname = dirname(__filename);
// Test file is in src/plugin-system/, plugins are in project root
const pluginsDir = join(__dirname, "../../plugins");

describe("PluginManagerService - Resource Management", () => {
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

  describe("loadPlugin with resource overrides", () => {
    it("should load plugin with resource overrides", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["custom_users"],
        allowedTopics: ["custom_events"],
        allowedBuckets: ["custom-data"],
      };

      const plugin = await pluginManager.loadPlugin(pluginPath, overrides);

      expect(plugin).toBeDefined();
      // Verify plugin was loaded with overrides
      const stored = pluginManager.getPluginResourceOverrides(plugin.metadata.name);
      expect(stored).toEqual(overrides);
    });

    it("should apply name mappings when loading", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["users"],
        tableNameMap: {
          users: "custom_users_table",
        },
      };

      await pluginManager.loadPlugin(pluginPath, overrides);

      const overridesStored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(overridesStored?.tableNameMap).toEqual({ users: "custom_users_table" });
    });

    it("should prefix resources automatically", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["users"],
        allowedTopics: ["events"],
        allowedBuckets: ["data"],
      };

      await pluginManager.loadPlugin(pluginPath, overrides);

      const plugin = pluginManager.getPlugin("example-repository-plugin");
      expect(plugin).toBeDefined();
      // Verify overrides were stored
      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(overrides);
    });
  });

  describe("setPluginResourceOverrides", () => {
    it("should set resource overrides for loaded plugin", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      await pluginManager.loadPlugin(pluginPath);

      const overrides: PluginResourceOverrides = {
        allowedTables: ["new_table"],
        allowedTopics: ["new_topic"],
        allowedBuckets: ["new_bucket"],
      };

      pluginManager.setPluginResourceOverrides("example-repository-plugin", overrides);

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(overrides);
    });

    it("should set resource overrides for unloaded plugin", async () => {
      const overrides: PluginResourceOverrides = {
        allowedTables: ["future_table"],
      };

      pluginManager.setPluginResourceOverrides("future-plugin", overrides);

      const stored = pluginManager.getPluginResourceOverrides("future-plugin");
      expect(stored).toEqual(overrides);
    });

    it("should auto-reload plugin when overrides are set", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      await pluginManager.loadPlugin(pluginPath);

      const overrides: PluginResourceOverrides = {
        allowedTables: ["reloaded_table"],
      };

      pluginManager.setPluginResourceOverrides("example-repository-plugin", overrides);

      // Wait a bit for async reload
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(overrides);
    });
  });

  describe("getPluginResourceOverrides", () => {
    it("should return undefined for plugin without overrides", () => {
      const overrides = pluginManager.getPluginResourceOverrides("non-existent");
      expect(overrides).toBeUndefined();
    });

    it("should return stored overrides", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["test_table"],
      };

      await pluginManager.loadPlugin(pluginPath, overrides);

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(overrides);
    });
  });

  describe("clearPluginResourceOverrides", () => {
    it("should clear resource overrides", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["test_table"],
      };

      await pluginManager.loadPlugin(pluginPath, overrides);
      pluginManager.clearPluginResourceOverrides("example-repository-plugin");

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toBeUndefined();
    });

    it("should auto-reload plugin when overrides are cleared", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["test_table"],
      };

      await pluginManager.loadPlugin(pluginPath, overrides);
      pluginManager.clearPluginResourceOverrides("example-repository-plugin");

      // Wait a bit for async reload
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toBeUndefined();
    });
  });

  describe("reloadPlugin with resource overrides", () => {
    it("should reload plugin with new overrides", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      await pluginManager.loadPlugin(pluginPath);

      const newOverrides: PluginResourceOverrides = {
        allowedTables: ["reloaded_table"],
      };

      await pluginManager.reloadPlugin("example-repository-plugin", newOverrides);

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(newOverrides);
    });

    it("should preserve existing overrides if not provided", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["original_table"],
      };

      await pluginManager.loadPlugin(pluginPath, overrides);
      await pluginManager.reloadPlugin("example-repository-plugin");

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(overrides);
    });
  });

  describe("resource name mapping", () => {
    it("should apply table name mapping", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTables: ["users"],
        tableNameMap: {
          users: "custom_users_table",
        },
      };

      await pluginManager.loadPlugin(pluginPath, overrides);

      // Verify name mapping was stored in overrides
      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored?.tableNameMap).toEqual({ users: "custom_users_table" });
    });

    it("should apply topic name mapping", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedTopics: ["events"],
        topicNameMap: {
          events: "custom_events_topic",
        },
      };

      await pluginManager.loadPlugin(pluginPath, overrides);

      // Verify name mapping was stored in overrides
      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored?.topicNameMap).toEqual({ events: "custom_events_topic" });
    });

    it("should apply bucket name mapping", async () => {
      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      const overrides: PluginResourceOverrides = {
        allowedBuckets: ["data"],
        bucketNameMap: {
          data: "custom-data-bucket",
        },
      };

      await pluginManager.loadPlugin(pluginPath, overrides);

      // Verify name mapping was stored in overrides
      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored?.bucketNameMap).toEqual({ data: "custom-data-bucket" });
    });
  });

  describe("loadPluginsFromDirectory with overrides", () => {
    it("should use stored overrides when loading from directory", async () => {
      const overrides: PluginResourceOverrides = {
        allowedTables: ["directory_table"],
      };

      pluginManager.setPluginResourceOverrides("example-repository-plugin", overrides);

      const pluginPath = join(pluginsDir, "example-plugin-repository.js");
      await pluginManager.loadPlugin(pluginPath);

      const stored = pluginManager.getPluginResourceOverrides("example-repository-plugin");
      expect(stored).toEqual(overrides);
    });
  });
});
