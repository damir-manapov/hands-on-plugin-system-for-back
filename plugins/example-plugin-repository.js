/**
 * Example plugin demonstrating repository-based access with restrictions
 */
export default {
  metadata: {
    name: "example-repository-plugin",
    version: "1.0.0",
    description: "Example plugin using restricted repositories",
    // Define allowed resources
    allowedTables: ["users", "orders"], // Only access these database tables
    allowedTopics: ["user-events", "order-events"], // Only access these Kafka topics
    allowedBuckets: ["plugin-data"], // Only access this S3 bucket
  },
  async initialize(context) {
    console.log("Initializing repository plugin...");

    // Access restricted repositories
    if (context.s3) {
      console.log("Allowed S3 buckets:", context.s3.getAllowedBuckets());
      // This will work - bucket is allowed
      // S3 service accepts both Buffer and string
      // Bucket parameter is now required (no defaults)
      await context.s3.upload("test.txt", "Hello", "text/plain", "plugin-data");
      // This will throw BucketAccessDeniedError - bucket not allowed
      // await context.s3.upload("test.txt", "Hello", "text/plain", "other-bucket");
    }

    if (context.database) {
      console.log("Allowed database tables:", context.database.getAllowedTables());
      // This will work - table is allowed
      const users = await context.database.executeQuery("SELECT * FROM users LIMIT 10");
      console.log(`Found ${users.length} users`);
      // This will throw TableAccessDeniedError - table not allowed
      // const products = await context.database.executeQuery("SELECT * FROM products LIMIT 10");
    }

    if (context.kafka) {
      console.log("Allowed Kafka topics:", context.kafka.getAllowedTopics());
      // This will work - topic is allowed
      await context.kafka.sendMessage("user-events", [
        { key: "user-1", value: JSON.stringify({ action: "created" }) },
      ]);
      // This will throw TopicAccessDeniedError - topic not allowed
      // await context.kafka.sendMessage("other-topic", [{ key: "test", value: "data" }]);
    }
  },
  cleanup() {
    console.log("Cleaning up repository plugin...");
  },
};
