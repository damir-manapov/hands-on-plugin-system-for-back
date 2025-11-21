export class PluginError extends Error {
  constructor(
    message: string,
    public readonly pluginName?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PluginNotFoundError extends PluginError {
  constructor(pluginName: string) {
    super(`Plugin '${pluginName}' not found`, pluginName);
  }
}

export class InvalidPluginFormatError extends PluginError {
  constructor(pluginPath: string, reason?: string) {
    super(`Invalid plugin format${reason ? `: ${reason}` : ""} at ${pluginPath}`, undefined);
  }
}

export class DependencyNotFoundError extends PluginError {
  constructor(pluginName: string, dependencyName: string) {
    super(
      `Plugin '${pluginName}' requires dependency '${dependencyName}' which is not loaded`,
      pluginName
    );
  }
}

export class SelfDependencyError extends PluginError {
  constructor(pluginName: string) {
    super(`Plugin '${pluginName}' cannot depend on itself`, pluginName);
  }
}

export class CircularDependencyError extends PluginError {
  constructor(pluginName: string, dependencyChain: string[]) {
    const chain = [...dependencyChain, pluginName].join(" -> ");
    super(`Circular dependency detected: ${chain}`, pluginName);
    this.dependencyChain = dependencyChain;
  }

  public readonly dependencyChain: string[];
}

export class UndeclaredDependencyError extends PluginError {
  constructor(pluginName: string, requestedDependency: string) {
    super(
      `Plugin '${pluginName}' attempted to access undeclared dependency: '${requestedDependency}'`,
      pluginName
    );
    this.requestedDependency = requestedDependency;
  }

  public readonly requestedDependency: string;
}

export class PluginLoadError extends PluginError {
  constructor(pluginPath: string, cause: Error) {
    super(`Failed to load plugin from ${pluginPath}: ${cause.message}`, undefined);
    this.cause = cause;
  }

  public readonly cause: Error;
}

export class PluginUnloadError extends PluginError {
  constructor(pluginName: string, cause: Error) {
    super(`Failed to unload plugin '${pluginName}': ${cause.message}`, pluginName);
    this.cause = cause;
  }

  public readonly cause: Error;
}

export class DependencyResolutionError extends PluginError {
  constructor(unresolvedPlugins: string[]) {
    const plugins = unresolvedPlugins.join(", ");
    super(
      `Cannot resolve plugin dependencies. Remaining plugins: ${plugins}. Check for missing or circular dependencies.`,
      undefined
    );
    this.unresolvedPlugins = unresolvedPlugins;
  }

  public readonly unresolvedPlugins: string[];
}
