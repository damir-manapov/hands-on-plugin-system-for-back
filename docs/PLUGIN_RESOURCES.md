# Plugin Resource Restrictions

This guide explains how resource restrictions work in the plugin system, including how to declare allowed resources, use repositories, and override resource access at runtime.

## Overview

The plugin system enforces **strict resource access control**. Plugins can only access resources (database tables, Kafka topics, S3 buckets) that are explicitly declared in their metadata. There are no defaults - all resources must be explicitly allowed.

## Declaring Resources

Resources are declared in the plugin's `metadata`:

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
  },
};
```

### Resource Types

- **`allowedTables`**: Database tables the plugin can access
- **`allowedTopics`**: Kafka topics the plugin can access
- **`allowedBuckets`**: S3 buckets the plugin can access

**Important**: If a resource type is not declared, the plugin cannot access any resources of that type.

## Automatic Resource Prefixing

All resources are automatically prefixed with the plugin name to ensure isolation:

- Plugin name: `my-plugin`
- Declared table: `users` → Actual table: `my-plugin_users`
- Declared topic: `events` → Actual topic: `my-plugin_events`
- Declared bucket: `data` → Actual bucket: `my-plugin_data`

**Plugins use unprefixed names** in their code. The system automatically adds the prefix when accessing resources.

## Using Repositories

Plugins access resources through restricted repositories available in the `PluginContext`:

### S3 Repository

```javascript
if (context.s3) {
  // Get allowed buckets (returns unprefixed names)
  const buckets = context.s3.getAllowedBuckets();
  console.log("Allowed buckets:", buckets); // ["plugin-data"]

  // Bucket parameter is REQUIRED (no defaults)
  await context.s3.upload("file.txt", "content", "text/plain", "plugin-data");
  const file = await context.s3.download("file.txt", "plugin-data");
  const exists = await context.s3.exists("file.txt", "plugin-data");
  const files = await context.s3.list("prefix/", "plugin-data");
  const url = await context.s3.getPresignedUrl("file.txt", 3600, "plugin-data");
  await context.s3.delete("file.txt", "plugin-data");
}
```

**Error**: `BucketAccessDeniedError` if accessing an undeclared bucket.

### Database Repository

```javascript
if (context.database) {
  // Get allowed tables (returns unprefixed names)
  const tables = context.database.getAllowedTables();
  console.log("Allowed tables:", tables); // ["users", "orders"]

  // Execute raw SQL queries (tables are automatically prefixed)
  const results = await context.database.executeQuery("SELECT * FROM users WHERE id = $1", [1]);

  // Execute SQL commands (tables are automatically prefixed)
  await context.database.executeCommand(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  // Insert data
  await context.database.executeCommand("INSERT INTO users (name) VALUES ($1)", ["John Doe"]);
}
```

**Error**: `TableAccessDeniedError` if accessing an undeclared table.

### Kafka Repository

```javascript
if (context.kafka) {
  // Get allowed topics (returns unprefixed names)
  const topics = context.kafka.getAllowedTopics();
  console.log("Allowed topics:", topics); // ["user-events"]

  // Topics are automatically prefixed
  await context.kafka.sendMessage("user-events", [
    { key: "key1", value: JSON.stringify({ message: "Hello" }) },
  ]);

  // Create a consumer
  const consumer = await context.kafka.createConsumer("my-consumer", "my-group");
  await context.kafka.subscribe("my-consumer", ["user-events"], async (payload) => {
    const message = payload.message.value?.toString();
    console.log("Received:", message);
  });

  // ksqlDB statements (topics in statements are automatically prefixed)
  await context.kafka.executeKsqlStatement(`
    CREATE STREAM IF NOT EXISTS user_events_stream (
      user_id VARCHAR,
      event_type VARCHAR
    ) WITH (
      KAFKA_TOPIC='user-events',
      VALUE_FORMAT='JSON'
    );
  `);
}
```

**Error**: `TopicAccessDeniedError` if accessing an undeclared topic.

## Runtime Resource Overrides

You can override resource lists and map resource names at runtime using the `PluginManagerService` API.

### Override When Loading

```typescript
import { PluginManagerService } from "./plugin-system/plugin-manager.service.js";

// Override resources when loading
await pluginManager.loadPlugin("/path/to/plugin.js", {
  allowedTables: ["custom_users", "custom_orders"],
  allowedTopics: ["custom-events"],
  allowedBuckets: ["custom-data"],
  // Map plugin resource names to actual resource names
  tableNameMap: {
    users: "custom_users_table", // Plugin uses "users" → accesses "custom_users_table"
  },
  topicNameMap: {
    "user-events": "shared-events", // Plugin uses "user-events" → accesses "shared-events"
  },
  bucketNameMap: {
    "plugin-data": "shared-data", // Plugin uses "plugin-data" → accesses "shared-data"
  },
});
```

### Set Overrides After Loading

```typescript
// Set resource overrides (plugin will be auto-reloaded)
pluginManager.setPluginResourceOverrides("my-plugin", {
  allowedTables: ["new_table"],
  tableNameMap: {
    users: "renamed_users_table",
  },
});

// Get current overrides
const overrides = pluginManager.getPluginResourceOverrides("my-plugin");

// Clear overrides (revert to metadata defaults)
pluginManager.clearPluginResourceOverrides("my-plugin");
```

### Resource Override Interface

```typescript
interface PluginResourceOverrides {
  allowedTables?: string[]; // Override allowed tables list
  allowedTopics?: string[]; // Override allowed topics list
  allowedBuckets?: string[]; // Override allowed buckets list
  tableNameMap?: Record<string, string>; // Map plugin table names to actual names
  topicNameMap?: Record<string, string>; // Map plugin topic names to actual names
  bucketNameMap?: Record<string, string>; // Map plugin bucket names to actual names
}
```

### Name Mapping

Name mappings allow plugins to use one name while accessing a different actual resource:

```typescript
// Plugin declares: allowedTables: ["users"]
// Override maps: { "users": "custom_users_table" }
// Result: Plugin uses "users" in code → accesses "custom_users_table" (prefixed: "plugin-slug_custom_users_table")
```

This is useful for:

- Renaming resources without changing plugin code
- Sharing resources between plugins
- Custom naming conventions
- Backward compatibility

## Error Handling

When a plugin tries to access an undeclared resource, it throws a specific error:

### TableAccessDeniedError

```javascript
try {
  await context.database.executeQuery("SELECT * FROM products");
} catch (error) {
  if (error.name === "TableAccessDeniedError") {
    console.error("Access denied to table:", error.message);
    // Error message includes allowed tables
  }
}
```

### TopicAccessDeniedError

```javascript
try {
  await context.kafka.sendMessage("unauthorized-topic", [{ value: "data" }]);
} catch (error) {
  if (error.name === "TopicAccessDeniedError") {
    console.error("Access denied to topic:", error.message);
    // Error message includes allowed topics
  }
}
```

### BucketAccessDeniedError

```javascript
try {
  await context.s3.upload("file.txt", "content", "text/plain", "unauthorized-bucket");
} catch (error) {
  if (error.name === "BucketAccessDeniedError") {
    console.error("Access denied to bucket:", error.message);
    // Error message includes allowed buckets
  }
}
```

## Limitations and Potential Issues

While the access restriction system provides strong protection, there are some limitations and edge cases to be aware of:

### Database Access Limitations

#### SQL Parsing Limitations

Table access validation uses regex-based SQL parsing, which may not catch all table references in complex queries:

- **Subqueries**: Tables referenced in nested subqueries might not be fully validated
- **CTEs (Common Table Expressions)**: `WITH` clauses might not be fully parsed
- **Dynamic SQL**: SQL constructed dynamically at runtime might bypass validation
- **Stored procedures/functions**: Calls to stored procedures that access tables might not be validated
- **Views**: Accessing views that reference multiple tables might not validate all underlying tables

**Example of potential bypass**:

```sql
-- This might not be fully validated if the parser doesn't handle CTEs
WITH temp AS (SELECT * FROM unauthorized_table)
SELECT * FROM temp;
```

**Recommendation**: Keep SQL queries simple and avoid complex nested queries. Test thoroughly to ensure all table references are validated.

### Kafka Access Limitations

ksqlDB statement validation validates `KAFKA_TOPIC` parameters explicitly in CREATE statements. However:

- **Complex statements**: Very complex ksqlDB statements with multiple topics might not be fully validated
- **Indirect topic access**: Streams/tables might reference topics indirectly through other streams

**Recommendation**: Keep ksqlDB statements simple and ensure all `KAFKA_TOPIC` parameters reference allowed topics.

### S3 Access Limitations

S3 repository validation is the most robust, as all operations explicitly require a bucket parameter. However:

- **Bucket name validation**: Bucket names are validated before each operation, but the validation happens at the repository level, not at the S3 service level
- **Presigned URLs**: Presigned URLs are generated with bucket validation, but once generated, they could potentially be used to access objects even if access is later revoked (this is a limitation of presigned URLs in general)

**Recommendation**: S3 access restrictions are generally reliable. Be cautious with presigned URLs and their expiration times.

### General Limitations

#### 1. Runtime Type Safety

TypeScript types provide compile-time safety, but at runtime:

- **Dynamic access**: JavaScript's dynamic nature means plugins could construct resource names dynamically
- **Type erasure**: Type information is erased at runtime, so runtime validation relies on string matching

**Recommendation**: Always validate resource names at runtime (which the repositories do), don't rely solely on TypeScript types.

#### 2. Resource Name Collisions

While resource prefixing prevents most collisions:

- **Name mapping edge cases**: Complex name mappings might create unexpected behavior
- **Case sensitivity**: Database systems might be case-sensitive or case-insensitive, which could affect validation

**Recommendation**: Use consistent naming conventions and test name mappings thoroughly.

#### 3. Performance Considerations

- **SQL parsing overhead**: Regex-based SQL parsing adds overhead to each query
- **Validation on every call**: Each repository method validates access, which adds a small performance cost

**Recommendation**: The performance impact is minimal for most use cases, but be aware of it for high-throughput scenarios.

### Security Recommendations

1. **Defense in depth**: Don't rely solely on repository restrictions - also implement database-level permissions, Kafka ACLs, and S3 bucket policies
2. **Audit logging**: Monitor and log all resource access attempts, including denied attempts
3. **Regular testing**: Test access restrictions thoroughly, including edge cases and complex queries
4. **Code review**: Review plugin code to ensure it's not attempting to bypass restrictions
5. **Least privilege**: Only grant plugins the minimum resources they need

## Best Practices

1. **Declare all resources**: Always declare all resources your plugin needs in metadata
2. **Use unprefixed names**: Plugins should use unprefixed resource names; the system handles prefixing
3. **Check repository availability**: Always check if repositories are available before using them
4. **Handle errors gracefully**: Catch and handle access denied errors appropriately
5. **Use name mappings for flexibility**: Use runtime name mappings when you need to adapt to different environments
6. **Document resource requirements**: Document which resources your plugin needs in its description
7. **Keep queries simple**: Avoid overly complex SQL or ksqlDB statements that might bypass validation
8. **Test thoroughly**: Test all resource access paths, including edge cases
9. **Monitor access**: Implement logging and monitoring for resource access attempts

## Examples

See `plugins/example-plugin-repository.js` for a complete example demonstrating resource restrictions.

## API Reference

### PluginManagerService Methods

- `loadPlugin(path, resourceOverrides?)`: Load a plugin with optional resource overrides
- `reloadPlugin(name, resourceOverrides?)`: Reload a plugin with optional resource overrides
- `setPluginResourceOverrides(name, overrides)`: Set resource overrides (auto-reloads plugin)
- `getPluginResourceOverrides(name)`: Get current resource overrides
- `clearPluginResourceOverrides(name)`: Clear resource overrides (revert to metadata)

### Repository Methods

#### S3Repository

- `upload(key, body, contentType, bucket)`: Upload file (bucket required)
- `download(key, bucket)`: Download file (bucket required)
- `delete(key, bucket)`: Delete file (bucket required)
- `list(prefix, bucket)`: List objects (bucket required)
- `exists(key, bucket)`: Check if object exists (bucket required)
- `getPresignedUrl(key, expiresIn, bucket)`: Get presigned URL (bucket required)
- `getAllowedBuckets()`: Get list of allowed buckets (unprefixed)

#### DatabaseRepository

- `executeQuery(querySql, parameters?)`: Execute SELECT query
- `executeCommand(querySql, parameters?)`: Execute INSERT/UPDATE/DELETE
- `getAllowedTables()`: Get list of allowed tables (unprefixed)

#### KafkaRepository

- `sendMessage(topic, messages, producerId?)`: Send messages to topic
- `createConsumer(id, groupId)`: Create consumer
- `subscribe(consumerId, topics, eachMessage)`: Subscribe to topics
- `disconnectConsumer(consumerId)`: Disconnect consumer
- `executeKsqlStatement(statement)`: Execute ksqlDB statement
- `getAllowedTopics()`: Get list of allowed topics (unprefixed)
