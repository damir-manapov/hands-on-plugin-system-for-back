# Thoughts on Plugin-Based System

This document references ideas and concepts from: https://github.com/damir-manapov/thoughts-on-plugin-based-system

## Core System Features

- Plugin registry, including remote
- Composed registry of entities
- Prisma-like repository for CRUDs, including to get related entities and define fields that need to be queried
- Ability to add code hooks
- Ability to add related entities (connect new repositories or repository-like entities to main entity) on create and update
- Ability to subscribe to events and to publish events
- Check if entity or entities used somewhere in system (to change/delete it)
- Dependencies between entities, circular dependencies forbidden
- Pass methods/repositories only if such dependencies defined
- Narrowed file storage
- Getting API to connect to external services by connections defined separately
- Should we give ability to define read-only circular dependencies?
- Migrations applied one by one
- Versions in plugin dependencies by explicit versions defined, not by range
- Ability to forbid all CRUD operations or write operations for all entities or for selected entities
- Predefined prompts to generate systems for different use cases, including tests

## Plugin Features

Plugins have:

- Translation keys
- Permissions
- RLS rules for plugins entities
- Defining required rules for methods
- Permissions for individual fields
- Ability to expose handlers through API
- Ability to define tests for user defined methods, mocks for dependencies, maybe even sets of mocks
- Ability to define auditing and metrics for handlers

## Current Implementation Status

This project implements a basic plugin system with:

✅ **Runtime plugin loading/unloading** - Plugins can be loaded and unloaded at runtime  
✅ **Explicit dependency declaration** - Plugins must declare their dependencies  
✅ **Dependency validation** - Automatic validation of dependencies and circular dependency detection  
✅ **Dependency injection** - Only declared dependencies are accessible to plugins  
✅ **Event-driven communication** - Plugins can emit and subscribe to arbitrary events  
✅ **Type-safe** - Full TypeScript support

## Future Enhancements

Based on the thoughts repository, future enhancements could include:

- [ ] Plugin registry (local and remote)
- [ ] Entity repository system (Prisma-like)
- [ ] Code hooks system
- [ ] Related entities management
- [ ] File storage with narrowed access
- [ ] External service connections API
- [ ] Migration system
- [ ] Version management for plugin dependencies
- [ ] Permission system (RLS rules, field-level permissions)
- [ ] API handler exposure
- [ ] Testing framework with mocks
- [ ] Auditing and metrics for handlers
- [ ] Translation keys system
