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
  private readonly nameMap: Map<string, string>;

  constructor(
    private readonly kafkaService: KafkaService,
    allowedTopics: string[],
    pluginSlug: string,
    nameMap?: Map<string, string>
  ) {
    this.pluginSlug = pluginSlug;
    // Topics are already prefixed by plugin manager, store them as-is
    this.allowedTopics = new Set(allowedTopics);
    this.nameMap = nameMap || new Map();
    this.logger.debug(
      `Created Kafka repository for plugin '${pluginSlug}' with allowed topics: ${allowedTopics.join(", ")}`
    );
  }

  /**
   * Apply name mapping if exists, then prefix with plugin slug
   */
  private prefixTopicName(topic: string): string {
    // Apply name mapping if exists
    const mappedTopic = this.nameMap.get(topic) || topic;
    // If already prefixed, return as is
    if (mappedTopic.startsWith(`${this.pluginSlug}_`)) {
      return mappedTopic;
    }
    return `${this.pluginSlug}_${mappedTopic}`;
  }

  /**
   * Validate that a topic is in the allowed list (after prefixing)
   */
  private validateTopicAccess(topic: string): void {
    const prefixedTopic = this.prefixTopicName(topic);
    if (!this.allowedTopics.has(prefixedTopic)) {
      // Get unprefixed allowed topics for error message
      const unprefixedAllowed = Array.from(this.allowedTopics).map((t) =>
        t.replace(`${this.pluginSlug}_`, "")
      );
      throw new TopicAccessDeniedError(topic, unprefixedAllowed);
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
