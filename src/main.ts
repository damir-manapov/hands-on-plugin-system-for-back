import { PluginManager } from "./core/plugin-manager.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const pluginManager = new PluginManager();
  const pluginsDir = join(__dirname, "../plugins");

  pluginManager.on("pluginLoaded", (plugin) => {
    console.log(`✓ Plugin loaded: ${plugin.metadata.name} v${plugin.metadata.version}`);
  });

  pluginManager.on("pluginUnloaded", (metadata) => {
    console.log(`✗ Plugin unloaded: ${metadata.name}`);
  });

  pluginManager.on("pluginError", (error, metadata) => {
    console.error(`✗ Plugin error${metadata ? ` (${metadata.name})` : ""}:`, error.message);
  });

  try {
    await pluginManager.loadPluginsFromDirectory(pluginsDir);

    console.log("\nPlugin system is running. Plugins can be loaded/unloaded at runtime.");
    console.log(
      "Use pluginManager.loadPlugin() and pluginManager.unloadPlugin() to manage plugins."
    );
    console.log("Press Ctrl+C to stop.\n");

    process.on("SIGINT", async () => {
      console.log("\nShutting down...");
      await pluginManager.unloadAll();
      process.exit(0);
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Failed to start plugin system:", err.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
