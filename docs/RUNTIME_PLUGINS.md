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

- `metadata`: Plugin name, version, description, **dependencies**, and **resource restrictions**
  - `dependencies`: Array of plugin names this plugin depends on (optional)
  - `allowedTables`: Array of database table names this plugin can access (optional)
  - `allowedTopics`: Array of Kafka topic names this plugin can access (optional)
  - `allowedBuckets`: Array of S3 bucket names this plugin can access (optional)
- `initialize(context)`: Optional initialization hook that receives a `PluginContext`
- `cleanup()`: Optional cleanup hook (called on unload)
- `execute()`: Optional execution method

### Plugin Context

The `PluginContext` provides:

- `eventBus`: Event bus for inter-plugin communication
  - `emit(event, data)`: Emit an event that other plugins can subscribe to
  - `on(event, listener)`: Subscribe to events from other plugins
  - `off(event, listener)`: Unsubscribe from events
  - `once(event, listener)`: Subscribe to an event once
- `getDependency(name)`: Get a declared dependency plugin by name (throws if not declared)
- `getDependencies()`: Get a Map of all declared dependency plugins
- `s3`: S3 repository (restricted to allowed buckets) - see [Resource Restrictions](#resource-restrictions)
- `database`: Database repository (restricted to allowed tables) - see [Resource Restrictions](#resource-restrictions)
- `kafka`: Kafka repository (restricted to allowed topics) - see [Resource Restrictions](#resource-restrictions)

**Important**:

- Plugins can only access plugins they declare as dependencies in their metadata. Attempting to access an undeclared plugin will throw an error.
- Plugins can only access resources (tables, topics, buckets) they declare in their metadata. See [Resource Restrictions](#resource-restrictions) below.

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
    dependencies: ["other-plugin"], // Declare dependencies here
  },
  context: null,
  async initialize(context) {
    console.log("Plugin initialized");
    // Store context for later use if needed
    // Engine automatically invalidates context on unload - no manual cleanup needed
    this.context = context;

    // Access declared dependencies
    const otherPlugin = context.getDependency("other-plugin");
    if (otherPlugin) {
      console.log("Found dependency:", otherPlugin.metadata.name);
    }

    // Get all dependencies
    const allDeps = context.getDependencies();
    console.log("All dependencies:", Array.from(allDeps.keys()));

    // Subscribe to events from other plugins
    context.eventBus.on("user:created", (data) => {
      console.log("User created:", data);
    });

    // Emit an event
    context.eventBus.emit("plugin:ready", {
      name: "my-plugin",
      timestamp: Date.now(),
    });
  },
  async cleanup() {
    // Engine automatically handles:
    // - Event listener cleanup
    // - Context invalidation
    // - Dependency cleanup
    // Only implement cleanup() if you need custom cleanup logic
    console.log("Plugin cleaned up");
  },
  async execute(input) {
    // Emit an event during execution
    // Context is automatically invalidated if plugin was unloaded
    if (this.context) {
      try {
        this.context.eventBus.emit("data:processed", {
          plugin: "my-plugin",
          input,
        });
      } catch {
        // Context may be invalidated if plugin was unloaded
        console.warn("Cannot emit event - plugin may be unloaded");
      }
    }
    return `Processed: ${input}`;
  },
};
```

### Dependency Management

Plugins must declare their dependencies in the `metadata.dependencies` array:

```javascript
export default {
  metadata: {
    name: "consumer-plugin",
    version: "1.0.0",
    dependencies: ["provider-plugin-1", "provider-plugin-2"], // Required dependencies
  },
  async initialize(context) {
    // Only declared dependencies are accessible
    const provider1 = context.getDependency("provider-plugin-1"); // ✅ OK
    const provider2 = context.getDependency("provider-plugin-2"); // ✅ OK
    const unknown = context.getDependency("unknown-plugin"); // ❌ Throws error

    // Get all dependencies as a Map
    const deps = context.getDependencies();
    // deps.get("provider-plugin-1") === provider1
  },
};
```

**Dependency Rules:**

- Dependencies must be loaded before the plugin that depends on them
- Circular dependencies are detected and prevented
- Plugins cannot depend on themselves
- Accessing undeclared dependencies throws an error
- When loading from a directory, plugins are automatically loaded in dependency order

### Inter-Plugin Event Communication

Plugins can communicate with each other through the event bus:

```javascript
export default {
  metadata: {
    name: "event-emitter-plugin",
    version: "1.0.0",
  },
  context: null,
  async initialize(context) {
    this.context = context;

    // Subscribe to events
    context.eventBus.on("task:started", (data) => {
      console.log("Task started:", data);
      // Process the event and emit a response
      context.eventBus.emit("task:acknowledged", {
        plugin: "event-emitter-plugin",
        taskId: data.taskId,
      });
    });

    // Subscribe to events from a specific pattern
    context.eventBus.on("data:*", (data) => {
      console.log("Data event received:", data);
    });
  },
  async cleanup() {
    this.context = null;
  },
};
```

## Resource Restrictions

Plugins must explicitly declare which resources they can access. Only declared resources are allowed - there are no defaults.

### Declaring Resources

```javascript
export default {
  metadata: {
    name: "my-plugin",
    version: "1.0.0",
    // Declare allowed resources
    allowedTables: ["users", "orders"], // Database tables
    allowedTopics: ["user-events"], // Kafka topics
    allowedBuckets: ["plugin-data"], // S3 buckets
  },
  async initialize(context) {
    // Access repositories (restricted to declared resources)
    if (context.database) {
      // Only "users" and "orders" tables are accessible
      const users = await context.database.executeQuery("SELECT * FROM users");
    }

    if (context.kafka) {
      // Only "user-events" topic is accessible
      await context.kafka.sendMessage("user-events", [{ value: "data" }]);
    }

    if (context.s3) {
      // Only "plugin-data" bucket is accessible (bucket parameter is required)
      await context.s3.upload("file.txt", "content", "text/plain", "plugin-data");
    }
  },
};
```

### Automatic Prefixing

All resources are automatically prefixed with the plugin name:

- Plugin: `my-plugin`
- Table `users` → Actual: `my-plugin_users`
- Topic `events` → Actual: `my-plugin_events`
- Bucket `data` → Actual: `my-plugin_data`

Plugins use unprefixed names in their code; the system handles prefixing automatically.

### Access Control Errors

Attempting to access undeclared resources throws errors:

- `TableAccessDeniedError` - for database tables
- `TopicAccessDeniedError` - for Kafka topics
- `BucketAccessDeniedError` - for S3 buckets

### Resource Overrides

You can override resource lists and map resource names at runtime:

```typescript
// Override allowed resources when loading
await pluginManager.loadPlugin("/path/to/plugin.js", {
  allowedTables: ["custom_users", "custom_orders"],
  tableNameMap: {
    users: "custom_users_table", // Map "users" → "custom_users_table"
  },
});

// Or set overrides after loading
pluginManager.setPluginResourceOverrides("my-plugin", {
  allowedTopics: ["new-topic"],
  topicNameMap: {
    "user-events": "shared-events", // Map "user-events" → "shared-events"
  },
});
```

See [PLUGIN_RESOURCES.md](./PLUGIN_RESOURCES.md) for comprehensive documentation on resource restrictions and overrides.

## Example

See `plugins/example-plugin-1.js`, `plugins/example-plugin-2.js`, and `plugins/example-plugin-repository.js` for reference implementations.

## Automatic Cleanup

The plugin engine **automatically handles cleanup** when plugins are unloaded:

- ✅ **Event listeners**: All event listeners are automatically removed
- ✅ **Context invalidation**: Plugin contexts become invalid and throw errors if used after unload
- ✅ **Dependency cleanup**: Dependency references are automatically cleared
- ✅ **Memory management**: All internal plugin state is cleaned up

**You don't need to manually clean up:**

- Event listeners (automatically removed)
- Context references (automatically invalidated)
- Dependency references (automatically cleared)

**Only implement `cleanup()` if you need custom cleanup logic** (e.g., closing file handles, stopping timers, etc.)

## Key Features

✅ **Runtime loading**: Plugins can be loaded/unloaded at runtime  
✅ **Automatic cleanup**: Engine handles all cleanup automatically  
✅ **Clean lifecycle**: Proper initialize/cleanup hooks  
✅ **Explicit dependencies**: Plugins must declare their dependencies  
✅ **Dependency validation**: Automatic validation of dependencies and circular dependency detection  
✅ **Dependency injection**: Only declared dependencies are accessible to plugins  
✅ **Event-driven communication**: Plugins can emit and subscribe to arbitrary events  
✅ **Inter-plugin communication**: Plugins can communicate with each other through events  
✅ **Resource restrictions**: Plugins can only access explicitly declared resources (tables, topics, buckets)  
✅ **Automatic prefixing**: Resources are automatically prefixed with plugin name for isolation  
✅ **Resource overrides**: Runtime override of resource lists and name mappings  
✅ **Type-safe**: Full TypeScript support  
✅ **Programmatic control**: Full control over when plugins are loaded/unloaded

## Limitations

- ES modules only (no CommonJS)
- Plugins must be in JavaScript files (`.js` or `.mjs`)
