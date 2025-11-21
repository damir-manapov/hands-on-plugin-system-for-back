import { describe, it, expect } from "vitest";
import { TopicAccessDeniedError } from "./kafka.errors.js";

describe("Kafka Repository Errors", () => {
  describe("TopicAccessDeniedError", () => {
    it("should create error with topic name and allowed topics", () => {
      const error = new TopicAccessDeniedError("unauthorized-topic", ["events", "logs"]);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TopicAccessDeniedError");
      expect(error.message).toContain("unauthorized-topic");
      expect(error.message).toContain("events");
      expect(error.message).toContain("logs");
    });

    it("should format error message correctly", () => {
      const error = new TopicAccessDeniedError("bad-topic", ["topic1", "topic2"]);

      expect(error.message).toBe(
        "Access denied to topic 'bad-topic'. Allowed topics: topic1, topic2"
      );
    });
  });
});
