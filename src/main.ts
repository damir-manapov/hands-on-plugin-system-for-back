import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { PluginManagerService } from "./plugin-system/plugin-manager.service.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });

  const pluginManager = app.get(PluginManagerService);
  const pluginsDir = join(__dirname, "../plugins");

  pluginManager.setPluginsDirectory(pluginsDir);

  pluginManager.on("pluginLoaded", (plugin) => {
    logger.log(`✓ Plugin loaded: ${plugin.metadata.name} v${plugin.metadata.version}`);
  });

  pluginManager.on("pluginUnloaded", (metadata) => {
    logger.log(`✗ Plugin unloaded: ${metadata.name}`);
  });

  pluginManager.on("pluginError", (error, metadata) => {
    logger.error(`✗ Plugin error${metadata ? ` (${metadata.name})` : ""}: ${error.message}`);
  });

  logger.log("\nPlugin system is running. Plugins can be loaded/unloaded at runtime.");
  logger.log("Use pluginManager.loadPlugin() and pluginManager.unloadPlugin() to manage plugins.");
  logger.log("Press Ctrl+C to stop.\n");

  process.on("SIGINT", async () => {
    logger.log("\nShutting down...");
    await app.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.log("\nShutting down...");
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
