import { describe, it, expect } from "vitest";
import {
  PluginError,
  PluginNotFoundError,
  InvalidPluginFormatError,
  DependencyNotFoundError,
  SelfDependencyError,
  CircularDependencyError,
  UndeclaredDependencyError,
  PluginLoadError,
  PluginUnloadError,
  DependencyResolutionError,
} from "./plugin-errors.js";

describe("Plugin Errors", () => {
  describe("PluginError", () => {
    it("should create base error with message", () => {
      const error = new PluginError("Test error", "test-plugin");

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error");
      expect(error.pluginName).toBe("test-plugin");
      expect(error.name).toBe("PluginError");
    });

    it("should handle undefined plugin name", () => {
      const error = new PluginError("Test error");

      expect(error.pluginName).toBeUndefined();
    });
  });

  describe("PluginNotFoundError", () => {
    it("should create error with plugin name", () => {
      const error = new PluginNotFoundError("missing-plugin");

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("PluginNotFoundError");
      expect(error.message).toContain("missing-plugin");
      expect(error.pluginName).toBe("missing-plugin");
    });
  });

  describe("InvalidPluginFormatError", () => {
    it("should create error with plugin path", () => {
      const error = new InvalidPluginFormatError("/path/to/plugin.js");

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("InvalidPluginFormatError");
      expect(error.message).toContain("/path/to/plugin.js");
    });

    it("should include reason if provided", () => {
      const error = new InvalidPluginFormatError("/path/to/plugin.js", "missing metadata");

      expect(error.message).toContain("missing metadata");
    });
  });

  describe("DependencyNotFoundError", () => {
    it("should create error with plugin and dependency names", () => {
      const error = new DependencyNotFoundError("plugin-a", "plugin-b");

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("DependencyNotFoundError");
      expect(error.message).toContain("plugin-a");
      expect(error.message).toContain("plugin-b");
      expect(error.pluginName).toBe("plugin-a");
    });
  });

  describe("SelfDependencyError", () => {
    it("should create error with plugin name", () => {
      const error = new SelfDependencyError("plugin-a");

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("SelfDependencyError");
      expect(error.message).toContain("plugin-a");
      expect(error.pluginName).toBe("plugin-a");
    });
  });

  describe("CircularDependencyError", () => {
    it("should create error with dependency chain", () => {
      const error = new CircularDependencyError("plugin-c", ["plugin-a", "plugin-b"]);

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("CircularDependencyError");
      expect(error.message).toContain("plugin-a");
      expect(error.message).toContain("plugin-b");
      expect(error.message).toContain("plugin-c");
      expect(error.dependencyChain).toEqual(["plugin-a", "plugin-b"]);
      expect(error.pluginName).toBe("plugin-c");
    });
  });

  describe("UndeclaredDependencyError", () => {
    it("should create error with plugin and requested dependency", () => {
      const error = new UndeclaredDependencyError("plugin-a", "plugin-b");

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("UndeclaredDependencyError");
      expect(error.message).toContain("plugin-a");
      expect(error.message).toContain("plugin-b");
      expect(error.requestedDependency).toBe("plugin-b");
      expect(error.pluginName).toBe("plugin-a");
    });
  });

  describe("PluginLoadError", () => {
    it("should create error with plugin path and cause", () => {
      const cause = new Error("Import failed");
      const error = new PluginLoadError("/path/to/plugin.js", cause);

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("PluginLoadError");
      expect(error.message).toContain("/path/to/plugin.js");
      expect(error.message).toContain("Import failed");
      expect(error.cause).toBe(cause);
    });
  });

  describe("PluginUnloadError", () => {
    it("should create error with plugin name and cause", () => {
      const cause = new Error("Cleanup failed");
      const error = new PluginUnloadError("plugin-a", cause);

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("PluginUnloadError");
      expect(error.message).toContain("plugin-a");
      expect(error.message).toContain("Cleanup failed");
      expect(error.cause).toBe(cause);
      expect(error.pluginName).toBe("plugin-a");
    });
  });

  describe("DependencyResolutionError", () => {
    it("should create error with unresolved plugins", () => {
      const error = new DependencyResolutionError(["plugin-a", "plugin-b"]);

      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe("DependencyResolutionError");
      expect(error.message).toContain("plugin-a");
      expect(error.message).toContain("plugin-b");
      expect(error.unresolvedPlugins).toEqual(["plugin-a", "plugin-b"]);
    });
  });
});
