import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { KafkaService } from "./kafka.service.js";

// Mock kafkajs
vi.mock("kafkajs", () => {
  const mockProducer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };

  const mockConsumer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(undefined),
  };

  // Create a proper class constructor that can be used with 'new'
  class MockKafka {
    producer = vi.fn().mockReturnValue(mockProducer);
    consumer = vi.fn().mockReturnValue(mockConsumer);

    constructor(_config?: unknown) {
      // Constructor can accept config but we don't need to use it
    }
  }

  return {
    Kafka: MockKafka,
    Producer: vi.fn(),
    Consumer: vi.fn(),
    __mockProducer: mockProducer,
    __mockConsumer: mockConsumer,
    __mockKafka: MockKafka,
  };
});

// Mock fetch for ksqlDB
global.fetch = vi.fn();

describe("KafkaService", () => {
  let kafkaService: KafkaService;
  let mockProducer: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  let mockConsumer: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
  let mockKafka: {
    producer: ReturnType<typeof vi.fn>;
    consumer: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_CLIENT_ID;
    delete process.env.KSQLDB_URL;
    delete process.env.KSQLDB_USERNAME;
    delete process.env.KSQLDB_PASSWORD;

    // Get mocks
    const kafkaModule = await import("kafkajs");
    mockProducer = (
      kafkaModule as unknown as {
        __mockProducer: {
          connect: ReturnType<typeof vi.fn>;
          disconnect: ReturnType<typeof vi.fn>;
          send: ReturnType<typeof vi.fn>;
        };
      }
    ).__mockProducer;
    mockConsumer = (
      kafkaModule as unknown as {
        __mockConsumer: {
          connect: ReturnType<typeof vi.fn>;
          disconnect: ReturnType<typeof vi.fn>;
          subscribe: ReturnType<typeof vi.fn>;
          run: ReturnType<typeof vi.fn>;
        };
      }
    ).__mockConsumer;
    // Get the instance from the service after it's created
    kafkaService = new KafkaService();
    mockKafka = kafkaService.getKafka() as unknown as {
      producer: ReturnType<typeof vi.fn>;
      consumer: ReturnType<typeof vi.fn>;
    };

    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (kafkaService) {
      await kafkaService.onModuleDestroy();
    }
  });

  describe("constructor", () => {
    it("should create Kafka instance with default config", () => {
      // Verify Kafka was instantiated by checking the service has a kafka instance
      expect(kafkaService.getKafka()).toBeDefined();
    });

    it("should use environment variables when provided", () => {
      process.env.KAFKA_BROKERS = "broker1:9092,broker2:9092";
      process.env.KAFKA_CLIENT_ID = "custom-client";

      const service = new KafkaService();
      // Verify service was created
      expect(service.getKafka()).toBeDefined();
      service.onModuleDestroy();
    });
  });

  describe("onModuleInit", () => {
    it("should initialize service", async () => {
      await kafkaService.onModuleInit();
      // Should not throw
    });
  });

  describe("onModuleDestroy", () => {
    it("should disconnect all producers and consumers", async () => {
      // Create some producers and consumers
      await kafkaService.getProducer("prod1");
      await kafkaService.createConsumer("cons1", "group1");

      await kafkaService.onModuleDestroy();

      expect(mockProducer.disconnect).toHaveBeenCalled();
      expect(mockConsumer.disconnect).toHaveBeenCalled();
    });
  });

  describe("getProducer", () => {
    it("should create and connect producer", async () => {
      const producer = await kafkaService.getProducer("test-producer");

      expect(mockKafka.producer).toHaveBeenCalled();
      expect(mockProducer.connect).toHaveBeenCalled();
      expect(producer).toBe(mockProducer);
    });

    it("should return existing producer if already created", async () => {
      const producer1 = await kafkaService.getProducer("test-producer");
      const producer2 = await kafkaService.getProducer("test-producer");

      expect(mockKafka.producer).toHaveBeenCalledTimes(1);
      expect(producer1).toBe(producer2);
    });
  });

  describe("sendMessage", () => {
    it("should send message to topic", async () => {
      await kafkaService.sendMessage("test-topic", [{ value: "test" }]);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: "test-topic",
        messages: [{ value: "test" }],
      });
    });

    it("should use custom producer ID", async () => {
      await kafkaService.sendMessage("test-topic", [{ value: "test" }], "custom-producer");

      expect(mockKafka.producer).toHaveBeenCalled();
    });
  });

  describe("createConsumer", () => {
    it("should create and connect consumer", async () => {
      const consumer = await kafkaService.createConsumer("test-consumer", "test-group");

      expect(mockKafka.consumer as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      expect(mockConsumer.connect as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      expect(consumer).toBe(mockConsumer);
    });

    it("should throw error if consumer already exists", async () => {
      await kafkaService.createConsumer("test-consumer", "test-group");

      await expect(kafkaService.createConsumer("test-consumer", "test-group")).rejects.toThrow(
        "already exists"
      );
    });
  });

  describe("subscribe", () => {
    it("should subscribe consumer to topics", async () => {
      await kafkaService.createConsumer("test-consumer", "test-group");
      const handler = vi.fn();

      await kafkaService.subscribe("test-consumer", ["topic1", "topic2"], handler);

      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topics: ["topic1", "topic2"],
        fromBeginning: false,
      });
      expect(mockConsumer.run).toHaveBeenCalled();
    });

    it("should throw error if consumer doesn't exist", async () => {
      const handler = vi.fn();

      await expect(kafkaService.subscribe("non-existent", ["topic1"], handler)).rejects.toThrow(
        "not found"
      );
    });
  });

  describe("disconnectConsumer", () => {
    it("should disconnect consumer", async () => {
      await kafkaService.createConsumer("test-consumer", "test-group");

      await kafkaService.disconnectConsumer("test-consumer");

      expect(mockConsumer.disconnect).toHaveBeenCalled();
    });

    it("should handle non-existent consumer gracefully", async () => {
      await expect(kafkaService.disconnectConsumer("non-existent")).resolves.not.toThrow();
    });
  });

  describe("executeKsqlQuery", () => {
    it("should execute ksqlDB query", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: "result" }),
      } as Response);

      const result = await kafkaService.executeKsqlQuery("SELECT * FROM stream;");

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8088/ksql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result).toEqual({ data: "result" });
    });

    it("should include auth headers if credentials provided", async () => {
      process.env.KSQLDB_USERNAME = "user";
      process.env.KSQLDB_PASSWORD = "pass";
      const service = new KafkaService();

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await service.executeKsqlQuery("SELECT * FROM stream;");

      const call = vi.mocked(global.fetch).mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBeDefined();
      expect(headers.Authorization).toContain("Basic");

      service.onModuleDestroy();
    });

    it("should throw error on failed request", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Error message",
      } as Response);

      await expect(kafkaService.executeKsqlQuery("INVALID QUERY")).rejects.toThrow();
    });
  });

  describe("executeKsqlStatement", () => {
    it("should delegate to executeKsqlQuery", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await kafkaService.executeKsqlStatement("CREATE STREAM test;");

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("getKsqlDBInfo", () => {
    it("should get ksqlDB server info", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: "1.0" }),
      } as Response);

      const result = await kafkaService.getKsqlDBInfo();

      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8088/info", {
        method: "GET",
        headers: {},
      });
      expect(result).toEqual({ version: "1.0" });
    });
  });

  describe("listKsqlStreams", () => {
    it("should list ksqlDB streams", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ streams: [] }),
      } as Response);

      await kafkaService.listKsqlStreams();

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("listKsqlTables", () => {
    it("should list ksqlDB tables", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tables: [] }),
      } as Response);

      await kafkaService.listKsqlTables();

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("getKafka", () => {
    it("should return Kafka instance", () => {
      const kafka = kafkaService.getKafka();
      expect(kafka).toBeDefined();
    });
  });
});
