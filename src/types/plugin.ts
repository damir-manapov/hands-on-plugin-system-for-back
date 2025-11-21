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

export interface PluginContext {
  eventBus: PluginEventBus;
  getDependency: (name: string) => Plugin | undefined;
  getDependencies: () => Map<string, Plugin>;
}

export interface Plugin {
  metadata: PluginMetadata;
  initialize?: (context: PluginContext) => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
  execute?: (input?: unknown) => Promise<unknown> | unknown;
}
