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
- Type-safe plugin system
- Event-driven inter-plugin communication (plugins can emit and subscribe to arbitrary events)

## Setup

```bash
pnpm install
```

## Docker Compose Services

Start infrastructure services (S3, PostgreSQL, Kafka, ksqlDB):

```bash
pnpm run compose:up
```

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

```bash
pnpm test
```

## Checks

```bash
./all-checks.sh
```

## Author

Damir Manapov

## License

MIT
