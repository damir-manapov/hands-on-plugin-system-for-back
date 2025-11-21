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
- `S3_BUCKET` - Default bucket name (default: `default-bucket`)
- `S3_FORCE_PATH_STYLE` - Force path-style URLs (default: `true`)

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

All services are automatically available in the plugin context:

```javascript
export default {
  metadata: {
    name: "my-plugin",
    version: "1.0.0",
  },
  async initialize(context) {
    // S3 Service
    await context.s3.upload("my-file.txt", Buffer.from("Hello World"), "text/plain");
    const file = await context.s3.download("my-file.txt");
    const exists = await context.s3.exists("my-file.txt");
    const files = await context.s3.list("prefix/");
    const url = await context.s3.getPresignedUrl("my-file.txt", 3600);

    // Database Service (Kysely)
    const db = context.database.getDb();
    // Use Kysely query builder
    const users = await db.selectFrom("users").selectAll().execute();

    // Or execute raw SQL
    const results = await context.database.executeQuery("SELECT * FROM users WHERE id = $1", [1]);

    // Kafka Service
    await context.kafka.sendMessage("my-topic", [
      { key: "key1", value: JSON.stringify({ message: "Hello" }) },
    ]);

    // Create a consumer
    const consumer = await context.kafka.createConsumer("my-consumer", "my-group");
    await context.kafka.subscribe("my-consumer", ["my-topic"], async (payload) => {
      const message = payload.message.value?.toString();
      console.log("Received:", message);
    });

    // ksqlDB
    await context.kafka.executeKsqlStatement(`
      CREATE STREAM user_events (
        user_id VARCHAR,
        event_type VARCHAR,
        timestamp BIGINT
      ) WITH (
        KAFKA_TOPIC='user-events',
        VALUE_FORMAT='JSON'
      );
    `);

    const streams = await context.kafka.listKsqlStreams();
    const tables = await context.kafka.listKsqlTables();
  },
};
```

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
docker compose ps
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

- Ensure Zookeeper is running first
- Wait for Kafka health check to pass
- Check Kafka logs: `docker logs kafka`
- Verify broker address matches configuration

### ksqlDB connection issues

- Ensure Kafka is running and healthy
- Check ksqlDB logs: `docker logs ksqldb-server`
- Verify ksqlDB URL matches configuration
