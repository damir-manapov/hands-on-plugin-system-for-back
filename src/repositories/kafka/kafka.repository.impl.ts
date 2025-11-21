import { Logger } from "@nestjs/common";
import type { KafkaRepository } from "./kafka.repository.js";
import type { KafkaService } from "../../services/kafka/kafka.service.js";
import type { Consumer, EachMessagePayload } from "kafkajs";
import { TopicAccessDeniedError } from "./kafka.errors.js";

/**
 * Kafka repository implementation with topic-level access restrictions
 */
export class KafkaRepositoryImpl implements KafkaRepository {
  private readonly logger = new Logger(KafkaRepositoryImpl.name);
  private readonly allowedTopics: Set<string>;
  private readonly pluginSlug: string;

  constructor(
    private readonly kafkaService: KafkaService,
    allowedTopics: string[],
    pluginSlug: string
  ) {
    this.pluginSlug = pluginSlug;
    // Store prefixed topic names
    this.allowedTopics = new Set(allowedTopics.map((t) => `${pluginSlug}_${t}`));
    this.logger.debug(
      `Created Kafka repository for plugin '${pluginSlug}' with allowed topics: ${allowedTopics.join(", ")}`
    );
  }

  /**
   * Prefix a topic name with the plugin slug
   */
  private prefixTopicName(topic: string): string {
    // If already prefixed, return as is
    if (topic.startsWith(`${this.pluginSlug}_`)) {
      return topic;
    }
    return `${this.pluginSlug}_${topic}`;
  }

  /**
   * Validate that a topic is in the allowed list (after prefixing)
   */
  private validateTopicAccess(topic: string): void {
    const prefixedTopic = this.prefixTopicName(topic);
    if (!this.allowedTopics.has(prefixedTopic)) {
      throw new TopicAccessDeniedError(topic, Array.from(this.allowedTopics));
    }
  }

  async sendMessage(
    topic: string,
    messages: Array<{ key?: string; value: string }>,
    producerId: string = "default"
  ): Promise<void> {
    this.validateTopicAccess(topic);
    const prefixedTopic = this.prefixTopicName(topic);
    return this.kafkaService.sendMessage(prefixedTopic, messages, producerId);
  }

  async createConsumer(id: string, groupId: string): Promise<Consumer> {
    return this.kafkaService.createConsumer(id, groupId);
  }

  async subscribe(
    consumerId: string,
    topics: string[],
    eachMessage: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    // Validate and prefix all topics before subscribing
    const prefixedTopics = topics.map((topic) => {
      this.validateTopicAccess(topic);
      return this.prefixTopicName(topic);
    });
    return this.kafkaService.subscribe(consumerId, prefixedTopics, eachMessage);
  }

  async disconnectConsumer(consumerId: string): Promise<void> {
    return this.kafkaService.disconnectConsumer(consumerId);
  }

  async executeKsqlStatement(statement: string): Promise<unknown> {
    // ksqlDB statements might reference topics, so we validate and prefix
    // Extract topic names from CREATE STREAM/TABLE statements
    const topicMatch = statement.match(/KAFKA_TOPIC\s*=\s*['"]([^'"]+)['"]/i);
    if (topicMatch) {
      this.validateTopicAccess(topicMatch[1]);
      const prefixedTopic = this.prefixTopicName(topicMatch[1]);
      statement = statement.replace(
        topicMatch[0],
        topicMatch[0].replace(topicMatch[1], prefixedTopic)
      );
    }
    return this.kafkaService.executeKsqlStatement(statement);
  }

  async executeKsqlQuery(query: string): Promise<unknown> {
    return this.kafkaService.executeKsqlQuery(query);
  }

  async getKsqlDBInfo(): Promise<unknown> {
    return this.kafkaService.getKsqlDBInfo();
  }

  async listKsqlStreams(): Promise<unknown> {
    return this.kafkaService.listKsqlStreams();
  }

  async listKsqlTables(): Promise<unknown> {
    return this.kafkaService.listKsqlTables();
  }

  getAllowedTopics(): string[] {
    // Return unprefixed topic names to plugins
    return Array.from(this.allowedTopics).map((t) => t.replace(`${this.pluginSlug}_`, ""));
  }
}
