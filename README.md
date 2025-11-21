# Hands-on Plugin System for Backend

Researching plugin system on backend with hot reload support.

> See [THOUGHTS.md](./THOUGHTS.md) for ideas and concepts from [thoughts-on-plugin-based-system](https://github.com/damir-manapov/thoughts-on-plugin-based-system)

## Features

- Plugin interface for defining plugins
- Plugin manager for runtime loading/unloading of plugins
- Explicit dependency declaration and validation
- Dependency injection (plugins can only access declared dependencies)
- Circular dependency detection
- Type-safe plugin system
- Event-driven inter-plugin communication (plugins can emit and subscribe to arbitrary events)

## Setup

```bash
pnpm install
```

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
