export interface PluginInterface {
  id: string;
  name: string;
  version: string;
  description: string;
  hooks: PluginHook[];
  config: PluginConfigSchema;
}

export interface PluginHook {
  name: HookName;
  handler: (data: unknown) => Promise<unknown>;
}

export type HookName = 'onInit' | 'onBeforeRequest' | 'onAfterRequest' | 'onError' | 'onShutdown';

export interface PluginConfigSchema {
  settings: Record<string, PluginSettingDefinition>;
}

export interface PluginSettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  required: boolean;
  default?: unknown;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  hooks: HookName[];
  config: PluginConfigSchema;
}

export interface PluginExecutionContext {
  organizationId: string;
  userId?: string;
  requestId?: string;
  metadata: Record<string, unknown>;
}

export interface PluginResult {
  success: boolean;
  data?: unknown;
  error?: string;
  continueExecution: boolean;
}
