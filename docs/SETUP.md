# Setup Guide

This guide explains how to set up and use S3, PostgreSQL (with Kysely), and Kafka (with ksqlDB) services in the plugin system.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and pnpm installed

## Starting Services

Start all services using Docker Compose:

```bash
pnpm run compose:up
```

This will start:

- **MinIO (S3)**: Available at `http://localhost:9000` (API) and `http://localhost:9001` (Console)
  - Default credentials: `minioadmin` / `minioadmin`
- **PostgreSQL**: Available at `localhost:5432`
  - Default credentials: `postgres` / `postgres`
  - Database: `plugin_system`
- **Kafka**: Available at `localhost:9092`
- **ksqlDB**: Available at `http://localhost:8088`
- **Schema Registry**: Available at `http://localhost:8081`

## Environment Variables

You can configure the services using environment variables:

### S3 (MinIO)

- `S3_ENDPOINT` - S3 endpoint URL (default: `http://localhost:9000`)
- `S3_REGION` - AWS region (default: `us-east-1`)
- `S3_ACCESS_KEY_ID` - Access key (default: `minioadmin`)
- `S3_SECRET_ACCESS_KEY` - Secret key (default: `minioadmin`)
- `S3_FORCE_PATH_STYLE` - Force path-style URLs (default: `true`)

**Note**: Plugins must explicitly declare allowed buckets in their metadata. There is no default bucket.

### Database (PostgreSQL)

- `DB_HOST` - Database host (default: `localhost`)
- `DB_PORT` - Database port (default: `5432`)
- `DB_NAME` - Database name (default: `plugin_system`)
- `DB_USER` - Database user (default: `postgres`)
- `DB_PASSWORD` - Database password (default: `postgres`)
- `DB_POOL_MAX` - Connection pool max size (default: `10`)

### Kafka

- `KAFKA_BROKERS` - Comma-separated list of Kafka brokers (default: `localhost:9092`)
- `KAFKA_CLIENT_ID` - Kafka client ID (default: `plugin-system`)

### ksqlDB

- `KSQLDB_URL` - ksqlDB server URL (default: `http://localhost:8088`)
- `KSQLDB_USERNAME` - ksqlDB username (optional)
- `KSQLDB_PASSWORD` - ksqlDB password (optional)

## Installing Dependencies

```bash
pnpm install
```

## Using Services in Plugins

Plugins access services through **restricted repositories** that enforce access control. You must declare allowed resources in your plugin metadata.

### Resource Restrictions

Plugins must explicitly declare which resources they can access:

- `allowedTables`: Database tables the plugin can access
- `allowedTopics`: Kafka topics the plugin can access
- `allowedBuckets`: S3 buckets the plugin can access

**Important**: Only explicitly declared resources are allowed. There are no defaults.

### Basic Plugin Example

```javascript
export default {
  metadata: {
    name: "my-plugin",
    version: "1.0.0",
    // Declare allowed resources
    allowedTables: ["users", "orders"],
    allowedTopics: ["user-events", "order-events"],
    allowedBuckets: ["plugin-data"],
  },
  async initialize(context) {
    // S3 Repository - bucket parameter is REQUIRED
    if (context.s3) {
      const buckets = context.s3.getAllowedBuckets();
      console.log("Allowed buckets:", buckets);

      // Bucket parameter is required (no defaults)
      await context.s3.upload(
        "my-file.txt",
        Buffer.from("Hello World"),
        "text/plain",
        "plugin-data"
      );
      const file = await context.s3.download("my-file.txt", "plugin-data");
      const exists = await context.s3.exists("my-file.txt", "plugin-data");
      const files = await context.s3.list("prefix/", "plugin-data");
      const url = await context.s3.getPresignedUrl("my-file.txt", 3600, "plugin-data");
    }

    // Database Repository - tables are automatically prefixed with plugin name
    if (context.database) {
      const tables = context.database.getAllowedTables();
      console.log("Allowed tables:", tables);

      // Use Kysely query builder (restricted to allowed tables)
      // Execute queries using executeQuery()
      // Tables are automatically prefixed: "my-plugin_users"
      const users = await db.selectFrom("users").selectAll().execute();

      // Or execute raw SQL (tables are automatically prefixed)
      const results = await context.database.executeQuery("SELECT * FROM users WHERE id = $1", [1]);

      // Create tables (will be prefixed automatically)
      await context.database.executeCommand(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );
      `);
    }

    // Kafka Repository - topics are automatically prefixed with plugin name
    if (context.kafka) {
      const topics = context.kafka.getAllowedTopics();
      console.log("Allowed topics:", topics);

      // Topics are automatically prefixed: "my-plugin_user-events"
      await context.kafka.sendMessage("user-events", [
        { key: "key1", value: JSON.stringify({ message: "Hello" }) },
      ]);

      // Create a consumer
      const consumer = await context.kafka.createConsumer("my-consumer", "my-group");
      await context.kafka.subscribe("my-consumer", ["user-events"], async (payload) => {
        const message = payload.message.value?.toString();
        console.log("Received:", message);
      });

      // ksqlDB (topics in statements are automatically prefixed)
      await context.kafka.executeKsqlStatement(`
        CREATE STREAM IF NOT EXISTS user_events_stream (
          user_id VARCHAR,
          event_type VARCHAR,
          timestamp BIGINT
        ) WITH (
          KAFKA_TOPIC='user-events',
          VALUE_FORMAT='JSON'
        );
      `);

      // Use executeKsqlStatement() for ksqlDB operations
    }
  },
};
```

### Automatic Resource Prefixing

All resources (tables, topics, buckets) are automatically prefixed with the plugin name:

- Plugin name: `my-plugin`
- Declared table: `users` → Actual table: `my-plugin_users`
- Declared topic: `events` → Actual topic: `my-plugin_events`
- Declared bucket: `data` → Actual bucket: `my-plugin_data`

Plugins use unprefixed names in their code, but the system automatically adds the prefix.

### Access Control

If a plugin tries to access a resource not in its allowed list, it will throw an error:

- `TableAccessDeniedError` - for database tables
- `TopicAccessDeniedError` - for Kafka topics
- `BucketAccessDeniedError` - for S3 buckets

See [PLUGIN_RESOURCES.md](./PLUGIN_RESOURCES.md) for detailed documentation on resource restrictions and overrides.

## MinIO Console

Access the MinIO web console at `http://localhost:9001` to:

- Create and manage buckets
- Upload/download files
- View bucket contents
- Configure access policies

## Kafka Topics

Create a Kafka topic:

```bash
docker exec -it kafka kafka-topics --create \
  --topic my-topic \
  --bootstrap-server localhost:9092 \
  --partitions 1 \
  --replication-factor 1
```

List topics:

```bash
docker exec -it kafka kafka-topics --list \
  --bootstrap-server localhost:9092
```

## ksqlDB CLI

Connect to ksqlDB CLI:

```bash
docker exec -it ksqldb-cli ksql http://ksqldb-server:8088
```

## Managing Services

### Start Services

```bash
pnpm run compose:up
```

### Stop Services

```bash
pnpm run compose:down
```

### Restart Services

```bash
pnpm run compose:restart
```

### Reset Services (⚠️ this will delete all data)

Stop services, remove volumes, and clean up orphaned containers:

```bash
pnpm run compose:reset
```

## Health Checks

All services include health checks. Check service status:

```bash
docker compose -f compose/docker-compose.yml ps
```

## Troubleshooting

### MinIO connection issues

- Ensure MinIO is running: `docker ps | grep minio`
- Check MinIO logs: `docker logs minio`
- Verify endpoint URL matches your configuration

### PostgreSQL connection issues

- Wait for PostgreSQL to be ready (health check)
- Verify credentials match environment variables
- Check PostgreSQL logs: `docker logs postgres`

### Kafka connection issues

- Kafka runs in KRaft mode (no Zookeeper required)
- Wait for Kafka health check to pass
- Check Kafka logs: `docker logs kafka`
- Verify broker address matches configuration

### ksqlDB connection issues

- Ensure Kafka is running and healthy
- Check ksqlDB logs: `docker logs ksqldb-server`
- Verify ksqlDB URL matches configuration
