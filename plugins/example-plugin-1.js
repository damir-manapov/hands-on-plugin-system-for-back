export default {
  metadata: {
    name: "example-plugin-1",
    version: "1.0.0",
    description: "Example plugin that greets users and emits events",
    dependencies: [],
  },
  async initialize(context) {
    console.log("[example-plugin-1] Initialized");

    // Subscribe to events from other plugins
    context.eventBus.on("user:created", (data) => {
      console.log("[example-plugin-1] Received user:created event:", data);
    });

    context.eventBus.on("data:processed", (data) => {
      console.log("[example-plugin-1] Received data:processed event:", data);
    });

    // Emit an event after initialization
    setTimeout(() => {
      context.eventBus.emit("greeting:ready", {
        message: "Hello from example-plugin-1!",
      });
    }, 1000);
  },
  async cleanup() {
    console.log("[example-plugin-1] Cleaned up");
  },
  async execute(input) {
    return `Hello from example-plugin-1! Received: ${JSON.stringify(input)}`;
  },
};
