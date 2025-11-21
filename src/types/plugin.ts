export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  // Resource access restrictions
  allowedTables?: string[]; // Database tables this plugin can access
  allowedTopics?: string[]; // Kafka topics this plugin can access
  allowedBuckets?: string[]; // S3 buckets this plugin can access
}

export interface PluginEventBus {
  emit(event: string, data?: unknown): void;
  on(event: string, listener: (data?: unknown) => void): void;
  off(event: string, listener: (data?: unknown) => void): void;
  once(event: string, listener: (data?: unknown) => void): void;
}

import type { S3Repository } from "../repositories/s3/s3.repository.js";
import type { DatabaseRepository } from "../repositories/database/database.repository.js";
import type { KafkaRepository } from "../repositories/kafka/kafka.repository.js";

export interface PluginContext {
  eventBus: PluginEventBus;
  getDependency: (name: string) => Plugin | undefined;
  getDependencies: () => Map<string, Plugin>;
  // Restricted repositories (required when using PluginManagerService, optional for standalone PluginManager)
  s3?: S3Repository;
  database?: DatabaseRepository;
  kafka?: KafkaRepository;
}

export interface Plugin {
  metadata: PluginMetadata;
  initialize?: (context: PluginContext) => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
  execute?: (input?: unknown) => Promise<unknown> | unknown;
}
