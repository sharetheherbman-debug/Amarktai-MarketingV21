export interface StudioClientOptions {
  organizationId?: string;
  getToken?: () => string | null | undefined;
}

export interface StudioGenerationInput {
  type: string;
  model?: unknown;
  prompt?: string;
  negative_prompt?: string;
  options?: Record<string, unknown>;
}

export class StudioClient {
  [key: string]: any;

  organizationId?: string;
  getToken?: () => string | null | undefined;

  constructor(options?: StudioClientOptions);

  listModels(operation?: string): Promise<any[]>;
  listHistory(limit?: number): Promise<any[]>;
  createGeneration(input: StudioGenerationInput): Promise<any>;
}

export default StudioClient;
