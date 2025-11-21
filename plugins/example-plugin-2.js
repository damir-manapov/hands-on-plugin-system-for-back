export default {
  metadata: {
    name: "example-plugin-2",
    version: "1.0.0",
    description: "Example plugin that performs calculations and emits events",
    dependencies: ["example-plugin-1"],
  },
  context: null,
  async initialize(context) {
    console.log("[example-plugin-2] Initialized");
    // Store context for use in execute method
    // Note: Engine automatically invalidates context on unload, no manual cleanup needed
    this.context = context;

    // Access declared dependency
    const plugin1 = context.getDependency("example-plugin-1");
    if (plugin1) {
      console.log("[example-plugin-2] Accessing dependency:", plugin1.metadata.name);
    }

    // Subscribe to events from other plugins
    context.eventBus.on("greeting:ready", (data) => {
      console.log("[example-plugin-2] Received greeting:ready event:", data);
      // Emit a response event
      context.eventBus.emit("greeting:acknowledged", {
        responder: "example-plugin-2",
        originalMessage: data,
      });
    });

    // Emit an event when calculations are ready
    context.eventBus.emit("calculator:ready", {
      operations: ["sum", "product"],
    });
  },
  async cleanup() {
    // Engine automatically handles:
    // - Event listener cleanup
    // - Context invalidation
    // - Dependency cleanup
    // Only implement cleanup() if you need custom cleanup logic
    console.log("[example-plugin-2] Cleaned up");
  },
  async execute(input) {
    if (typeof input === "object" && input !== null && "a" in input && "b" in input) {
      const { a, b } = input;
      const result = {
        sum: Number(a) + Number(b),
        product: Number(a) * Number(b),
      };

      // Emit an event with the calculation result
      // Context is automatically invalidated if plugin was unloaded
      if (this.context) {
        try {
          this.context.eventBus.emit("data:processed", {
            operation: "calculation",
            input: { a, b },
            result,
          });
        } catch {
          // Context may be invalidated if plugin was unloaded
          console.warn("[example-plugin-2] Cannot emit event - plugin may be unloaded");
        }
      }

      return result;
    }
    return { error: "Expected {a: number, b: number}" };
  },
};
