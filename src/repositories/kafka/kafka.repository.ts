import type { Consumer, EachMessagePayload } from "kafkajs";

/**
 * Restricted Kafka repository that only allows access to specific topics
 */
export interface KafkaRepository {
  /**
   * Send messages to an allowed topic
   * @param topic Topic name (must be in allowed topics)
   * @param messages Array of messages to send
   * @param producerId Optional producer ID
   */
  sendMessage(
    topic: string,
    messages: Array<{ key?: string; value: string }>,
    producerId?: string
  ): Promise<void>;

  /**
   * Create a consumer for allowed topics
   * @param id Consumer ID
   * @param groupId Consumer group ID
   */
  createConsumer(id: string, groupId: string): Promise<Consumer>;

  /**
   * Subscribe to allowed topics
   * @param consumerId Consumer ID
   * @param topics Array of topic names (must be in allowed topics)
   * @param eachMessage Message handler
   */
  subscribe(
    consumerId: string,
    topics: string[],
    eachMessage: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void>;

  /**
   * Disconnect a consumer
   * @param consumerId Consumer ID
   */
  disconnectConsumer(consumerId: string): Promise<void>;

  /**
   * Execute a ksqlDB statement (read-only operations)
   */
  executeKsqlStatement(statement: string): Promise<unknown>;

  /**
   * Execute a ksqlDB query
   */
  executeKsqlQuery(query: string): Promise<unknown>;

  /**
   * Get ksqlDB server info
   */
  getKsqlDBInfo(): Promise<unknown>;

  /**
   * List ksqlDB streams
   */
  listKsqlStreams(): Promise<unknown>;

  /**
   * List ksqlDB tables
   */
  listKsqlTables(): Promise<unknown>;

  /**
   * Get the list of allowed topic names
   */
  getAllowedTopics(): string[];
}
