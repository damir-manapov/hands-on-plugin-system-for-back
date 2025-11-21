/**
 * Error thrown when trying to access a topic that is not allowed
 */
export class TopicAccessDeniedError extends Error {
  constructor(topicName: string, allowedTopics: string[]) {
    super(`Access denied to topic '${topicName}'. Allowed topics: ${allowedTopics.join(", ")}`);
    this.name = "TopicAccessDeniedError";
  }
}
