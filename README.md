# Hands-on Plugin System for Backend

Researching plugin system on backend built with NestJS. Plugins are **not** NestJS modules - they are simple JavaScript/TypeScript modules that can be loaded at runtime.

> See [THOUGHTS.md](./THOUGHTS.md) for ideas and concepts from [thoughts-on-plugin-based-system](https://github.com/damir-manapov/thoughts-on-plugin-based-system)

## Features

- **NestJS-based**: Core system built with NestJS framework
- **Simple plugin format**: Plugins are plain JS/TS modules (not NestJS modules)
- Plugin manager service for runtime loading/unloading of plugins
- Explicit dependency declaration and validation
- Dependency injection (plugins can only access declared dependencies)
- Circular dependency detection
- **Resource restrictions**: Plugins can only access explicitly declared resources (tables, topics, buckets)
- **Automatic resource prefixing**: Resources are automatically prefixed with plugin name for isolation
- **Resource overrides**: Runtime override of resource lists and name mappings
- Type-safe plugin system
- Event-driven inter-plugin communication (plugins can emit and subscribe to arbitrary events)
- **S3, PostgreSQL, and Kafka integration**: Restricted repositories for secure resource access

## Setup

```bash
pnpm install
```

## Docker Compose Services

Start infrastructure services (S3, PostgreSQL, Kafka, ksqlDB):

```bash
pnpm run compose:up
```

This will start all services and wait for them to be ready. The starter service ensures all services are healthy before completing.

Stop services:

```bash
pnpm run compose:down
```

Restart services:

```bash
pnpm run compose:restart
```

Reset services (⚠️ removes all data):

```bash
pnpm run compose:reset
```

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Test

Run unit tests:

```bash
pnpm test:unit
```

Run e2e tests:

```bash
# Option 1: Use the e2e script (automatically starts services if needed)
./e2e.sh

# Option 2: Manual approach
pnpm run compose:up  # Start services first
pnpm test:e2e       # Run e2e tests
```

Run all tests:

```bash
pnpm test
```

Watch mode (unit tests):

```bash
pnpm test:watch
```

## Checks

```bash
./all-checks.sh
```

## Author

Damir Manapov

## License

MIT
