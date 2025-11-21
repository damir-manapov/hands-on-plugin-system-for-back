import { describe, it, expect, beforeEach, vi } from "vitest";
import { KafkaRepositoryImpl } from "./kafka.repository.impl.js";
import { KafkaService } from "../../services/kafka/kafka.service.js";
import { TopicAccessDeniedError } from "./kafka.errors.js";
import type { Consumer } from "kafkajs";

describe("KafkaRepositoryImpl", () => {
  let mockKafkaService: KafkaService;
  let repository: KafkaRepositoryImpl;
  let mockConsumer: Consumer;

  beforeEach(() => {
    mockConsumer = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
    } as unknown as Consumer;

    mockKafkaService = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      createConsumer: vi.fn().mockResolvedValue(mockConsumer),
      subscribe: vi.fn().mockResolvedValue(undefined),
      disconnectConsumer: vi.fn().mockResolvedValue(undefined),
      executeKsqlStatement: vi.fn().mockResolvedValue({}),
    } as unknown as KafkaService;

    repository = new KafkaRepositoryImpl(
      mockKafkaService,
      ["plugin-slug_events", "plugin-slug_logs"],
      "plugin-slug"
    );
  });

  describe("constructor", () => {
    it("should store allowed topics as prefixed", () => {
      const repo = new KafkaRepositoryImpl(
        mockKafkaService,
        ["plugin-slug_events", "plugin-slug_logs"],
        "plugin-slug"
      );
      expect(repo.getAllowedTopics()).toEqual(["events", "logs"]);
    });

    it("should accept name map", () => {
      const nameMap = new Map([["events", "custom_events"]]);
      const repo = new KafkaRepositoryImpl(
        mockKafkaService,
        ["plugin-slug_custom_events"],
        "plugin-slug",
        nameMap
      );
      expect(repo.getAllowedTopics()).toEqual(["custom_events"]);
    });
  });

  describe("getAllowedTopics", () => {
    it("should return unprefixed topic names", () => {
      const topics = repository.getAllowedTopics();
      expect(topics).toEqual(["events", "logs"]);
    });
  });

  describe("sendMessage", () => {
    it("should allow sending to declared topic", async () => {
      await repository.sendMessage("events", [{ value: "test" }]);

      expect(mockKafkaService.sendMessage).toHaveBeenCalledWith(
        "plugin-slug_events",
        [{ value: "test" }],
        "default"
      );
    });

    it("should allow custom producer ID", async () => {
      await repository.sendMessage("events", [{ value: "test" }], "custom-producer");

      expect(mockKafkaService.sendMessage).toHaveBeenCalledWith(
        "plugin-slug_events",
        [{ value: "test" }],
        "custom-producer"
      );
    });

    it("should throw TopicAccessDeniedError for undeclared topic", async () => {
      await expect(repository.sendMessage("unauthorized", [{ value: "test" }])).rejects.toThrow(
        TopicAccessDeniedError
      );
      expect(mockKafkaService.sendMessage).not.toHaveBeenCalled();
    });

    it("should handle name mapping", async () => {
      const nameMap = new Map([["events", "custom_events"]]);
      const repo = new KafkaRepositoryImpl(
        mockKafkaService,
        ["plugin-slug_custom_events"],
        "plugin-slug",
        nameMap
      );

      await repo.sendMessage("events", [{ value: "test" }]);

      expect(mockKafkaService.sendMessage).toHaveBeenCalledWith(
        "plugin-slug_custom_events",
        [{ value: "test" }],
        "default"
      );
    });
  });

  describe("createConsumer", () => {
    it("should delegate to kafka service", async () => {
      const consumer = await repository.createConsumer("consumer-1", "group-1");

      expect(mockKafkaService.createConsumer).toHaveBeenCalledWith("consumer-1", "group-1");
      expect(consumer).toBe(mockConsumer);
    });
  });

  describe("subscribe", () => {
    it("should allow subscribing to declared topics", async () => {
      const handler = vi.fn();
      await repository.subscribe("consumer-1", ["events"], handler);

      expect(mockKafkaService.subscribe).toHaveBeenCalledWith(
        "consumer-1",
        ["plugin-slug_events"],
        handler
      );
    });

    it("should allow subscribing to multiple topics", async () => {
      const handler = vi.fn();
      await repository.subscribe("consumer-1", ["events", "logs"], handler);

      expect(mockKafkaService.subscribe).toHaveBeenCalledWith(
        "consumer-1",
        ["plugin-slug_events", "plugin-slug_logs"],
        handler
      );
    });

    it("should throw TopicAccessDeniedError for undeclared topic", async () => {
      const handler = vi.fn();
      await expect(repository.subscribe("consumer-1", ["unauthorized"], handler)).rejects.toThrow(
        TopicAccessDeniedError
      );
      expect(mockKafkaService.subscribe).not.toHaveBeenCalled();
    });

    it("should validate all topics before subscribing", async () => {
      const handler = vi.fn();
      await expect(
        repository.subscribe("consumer-1", ["events", "unauthorized"], handler)
      ).rejects.toThrow(TopicAccessDeniedError);
      expect(mockKafkaService.subscribe).not.toHaveBeenCalled();
    });
  });

  describe("disconnectConsumer", () => {
    it("should delegate to kafka service", async () => {
      await repository.disconnectConsumer("consumer-1");

      expect(mockKafkaService.disconnectConsumer).toHaveBeenCalledWith("consumer-1");
    });
  });

  describe("executeKsqlStatement", () => {
    it("should allow ksqlDB statement with declared topic", async () => {
      await repository.executeKsqlStatement(`
        CREATE STREAM events_stream (
          data VARCHAR
        ) WITH (
          KAFKA_TOPIC='events',
          VALUE_FORMAT='JSON'
        );
      `);

      expect(mockKafkaService.executeKsqlStatement).toHaveBeenCalled();
      const call = vi.mocked(mockKafkaService.executeKsqlStatement).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_events");
    });

    it("should throw TopicAccessDeniedError for undeclared topic in statement", async () => {
      await expect(
        repository.executeKsqlStatement(`
          CREATE STREAM stream (
            data VARCHAR
          ) WITH (
            KAFKA_TOPIC='unauthorized',
            VALUE_FORMAT='JSON'
          );
        `)
      ).rejects.toThrow(TopicAccessDeniedError);
      expect(mockKafkaService.executeKsqlStatement).not.toHaveBeenCalled();
    });

    it("should handle statements without KAFKA_TOPIC", async () => {
      await repository.executeKsqlStatement("SELECT * FROM some_table;");

      expect(mockKafkaService.executeKsqlStatement).toHaveBeenCalledWith(
        "SELECT * FROM some_table;"
      );
    });

    it("should handle name mapping in ksqlDB statements", async () => {
      const nameMap = new Map([["events", "custom_events"]]);
      const repo = new KafkaRepositoryImpl(
        mockKafkaService,
        ["plugin-slug_custom_events"],
        "plugin-slug",
        nameMap
      );

      await repo.executeKsqlStatement(`
        CREATE STREAM stream (
          data VARCHAR
        ) WITH (
          KAFKA_TOPIC='events',
          VALUE_FORMAT='JSON'
        );
      `);

      const call = vi.mocked(mockKafkaService.executeKsqlStatement).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_custom_events");
    });
  });
});
