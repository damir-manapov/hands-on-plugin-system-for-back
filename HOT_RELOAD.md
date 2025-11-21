# Runtime Plugin System

This project implements a plugin system that supports **loading and unloading plugins at runtime** without restarting the application.

## How It Works

### Plugin Manager (`src/core/plugin-manager.ts`)

The `PluginManager` class handles:

- **Loading plugins**: Dynamically imports plugin modules using ES module `import()`
- **Unloading plugins**: Calls plugin cleanup hooks and removes them from memory
- **Reloading plugins**: Unloads and reloads a plugin in sequence
- **Event emission**: Emits events when plugins are loaded/unloaded/error

### Plugin Interface (`src/types/plugin.ts`)

Plugins must implement:

- `metadata`: Plugin name, version, description
- `initialize()`: Optional initialization hook
- `cleanup()`: Optional cleanup hook (called on unload)
- `execute()`: Optional execution method

## Usage

### Programmatic Loading/Unloading

```typescript
import { PluginManager } from "./core/plugin-manager.js";

const pluginManager = new PluginManager();

// Load a plugin
await pluginManager.loadPlugin("/path/to/plugin.js");

// Unload a plugin
await pluginManager.unloadPlugin("plugin-name");

// Reload a plugin
await pluginManager.reloadPlugin("plugin-name");

// Load all plugins from a directory
await pluginManager.loadPluginsFromDirectory("./plugins");

// Get a plugin
const plugin = pluginManager.getPlugin("plugin-name");

// Execute a plugin
const result = await plugin?.execute({ data: "test" });
```

### Event Handling

```typescript
pluginManager.on("pluginLoaded", (plugin) => {
  console.log(`Plugin loaded: ${plugin.metadata.name}`);
});

pluginManager.on("pluginUnloaded", (metadata) => {
  console.log(`Plugin unloaded: ${metadata.name}`);
});

pluginManager.on("pluginError", (error, metadata) => {
  console.error(`Error in plugin ${metadata?.name}:`, error);
});
```

### Create a Plugin

Create a file (e.g., `my-plugin.js`):

```javascript
export default {
  metadata: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
  },
  async initialize() {
    console.log("Plugin initialized");
  },
  async cleanup() {
    console.log("Plugin cleaned up");
  },
  async execute(input) {
    return `Processed: ${input}`;
  },
};
```

## Example

See `plugins/example-plugin-1.js` and `plugins/example-plugin-2.js` for reference implementations.

## Key Features

✅ **Runtime loading**: Plugins can be loaded/unloaded at runtime  
✅ **Clean lifecycle**: Proper initialize/cleanup hooks  
✅ **Event-driven**: Emit events for plugin lifecycle changes  
✅ **Type-safe**: Full TypeScript support  
✅ **Programmatic control**: Full control over when plugins are loaded/unloaded

## Limitations

- ES modules only (no CommonJS)
- Plugins must be in JavaScript files (`.js` or `.mjs`)
