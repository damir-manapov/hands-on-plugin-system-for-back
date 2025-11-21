import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import {
  Kafka,
  Producer,
  Consumer,
  KafkaConfig,
  ProducerConfig,
  ConsumerConfig,
  EachMessagePayload,
} from "kafkajs";

export interface KafkaServiceConfig {
  brokers: string[];
  clientId?: string;
}

export interface KsqlDBConfig {
  url: string;
  username?: string;
  password?: string;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private brokers: string[];
  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();
  private ksqlDBUrl: string;
  private ksqlDBAuth?: { username: string; password: string };

  constructor() {
    const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
    const clientId = process.env.KAFKA_CLIENT_ID || "plugin-system";

    this.brokers = brokers;

    const kafkaConfig: KafkaConfig = {
      brokers,
      clientId,
    };

    this.kafka = new Kafka(kafkaConfig);

    // ksqlDB configuration
    this.ksqlDBUrl = process.env.KSQLDB_URL || "http://localhost:8088";
    if (process.env.KSQLDB_USERNAME && process.env.KSQLDB_PASSWORD) {
      this.ksqlDBAuth = {
        username: process.env.KSQLDB_USERNAME,
        password: process.env.KSQLDB_PASSWORD,
      };
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(`Kafka Service initialized - Brokers: ${this.brokers.join(", ")}`);
    this.logger.log(`ksqlDB URL: ${this.ksqlDBUrl}`);
  }

  async onModuleDestroy(): Promise<void> {
    // Disconnect all producers
    for (const [id, producer] of this.producers.entries()) {
      try {
        await producer.disconnect();
        this.logger.debug(`Producer disconnected: ${id}`);
      } catch (error) {
        this.logger.warn(`Error disconnecting producer ${id}: ${error}`);
      }
    }
    this.producers.clear();

    // Disconnect all consumers
    for (const [id, consumer] of this.consumers.entries()) {
      try {
        await consumer.disconnect();
        this.logger.debug(`Consumer disconnected: ${id}`);
      } catch (error) {
        this.logger.warn(`Error disconnecting consumer ${id}: ${error}`);
      }
    }
    this.consumers.clear();

    this.logger.log("Kafka Service destroyed");
  }

  /**
   * Get or create a producer
   */
  async getProducer(id: string = "default", config?: ProducerConfig): Promise<Producer> {
    if (!this.producers.has(id)) {
      const producer = this.kafka.producer(config || {});
      await producer.connect();
      this.producers.set(id, producer);
      this.logger.debug(`Producer created and connected: ${id}`);
    }
    return this.producers.get(id)!;
  }

  /**
   * Send a message to a topic
   */
  async sendMessage(
    topic: string,
    messages: Array<{ key?: string; value: string | Buffer; headers?: Record<string, string> }>,
    producerId: string = "default"
  ): Promise<void> {
    const producer = await this.getProducer(producerId);
    await producer.send({
      topic,
      messages,
    });
    this.logger.debug(`Sent ${messages.length} message(s) to topic: ${topic}`);
  }

  /**
   * Create a consumer
   */
  async createConsumer(id: string, groupId: string, config?: ConsumerConfig): Promise<Consumer> {
    if (this.consumers.has(id)) {
      throw new Error(`Consumer with id '${id}' already exists`);
    }

    const consumer = this.kafka.consumer({
      groupId,
      ...config,
    });
    await consumer.connect();
    this.consumers.set(id, consumer);
    this.logger.debug(`Consumer created and connected: ${id} (groupId: ${groupId})`);
    return consumer;
  }

  /**
   * Subscribe to a topic and consume messages
   */
  async subscribe(
    consumerId: string,
    topics: string[],
    handler: (payload: EachMessagePayload) => Promise<void> | void
  ): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`Consumer '${consumerId}' not found. Create it first with createConsumer()`);
    }

    await consumer.subscribe({ topics, fromBeginning: false });
    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await handler(payload);
        } catch (error) {
          this.logger.error(`Error processing message from ${payload.topic}: ${error}`);
        }
      },
    });

    this.logger.debug(`Consumer ${consumerId} subscribed to topics: ${topics.join(", ")}`);
  }

  /**
   * Get the Kafka client instance
   */
  getKafka(): Kafka {
    return this.kafka;
  }

  /**
   * Execute a ksqlDB query
   */
  async executeKsqlQuery(ksql: string): Promise<unknown> {
    const url = `${this.ksqlDBUrl}/ksql`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.ksqlDBAuth) {
      const auth = Buffer.from(`${this.ksqlDBAuth.username}:${this.ksqlDBAuth.password}`).toString(
        "base64"
      );
      headers.Authorization = `Basic ${auth}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ksql,
        streamProperties: {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ksqlDB query failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Execute a ksqlDB statement (CREATE STREAM, CREATE TABLE, etc.)
   */
  async executeKsqlStatement(ksql: string): Promise<unknown> {
    return this.executeKsqlQuery(ksql);
  }

  /**
   * Get ksqlDB server info
   */
  async getKsqlDBInfo(): Promise<unknown> {
    const url = `${this.ksqlDBUrl}/info`;
    const headers: Record<string, string> = {};

    if (this.ksqlDBAuth) {
      const auth = Buffer.from(`${this.ksqlDBAuth.username}:${this.ksqlDBAuth.password}`).toString(
        "base64"
      );
      headers.Authorization = `Basic ${auth}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get ksqlDB info: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * List ksqlDB streams
   */
  async listKsqlStreams(): Promise<unknown> {
    return this.executeKsqlQuery("SHOW STREAMS;");
  }

  /**
   * List ksqlDB tables
   */
  async listKsqlTables(): Promise<unknown> {
    return this.executeKsqlQuery("SHOW TABLES;");
  }
}
