export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
}

export interface PluginEventBus {
  emit(event: string, data?: unknown): void;
  on(event: string, listener: (data?: unknown) => void): void;
  off(event: string, listener: (data?: unknown) => void): void;
  once(event: string, listener: (data?: unknown) => void): void;
}

import type { S3Service } from "../services/s3/s3.service.js";
import type { DatabaseService } from "../services/database/database.service.js";
import type { KafkaService } from "../services/kafka/kafka.service.js";

export interface PluginContext {
  eventBus: PluginEventBus;
  getDependency: (name: string) => Plugin | undefined;
  getDependencies: () => Map<string, Plugin>;
  // System services (required when using PluginManagerService, optional for standalone PluginManager)
  s3?: S3Service;
  database?: DatabaseService;
  kafka?: KafkaService;
}

export interface Plugin {
  metadata: PluginMetadata;
  initialize?: (context: PluginContext) => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
  execute?: (input?: unknown) => Promise<unknown> | unknown;
}
