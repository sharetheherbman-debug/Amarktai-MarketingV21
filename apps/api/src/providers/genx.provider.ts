import { ChatMessage, ChatOptions, ChatResult, EmbeddingResult, ProviderInterface } from '../types';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export class GenXProvider implements ProviderInterface {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  getName(): string {
    return 'genx';
  }

  getModels(): string[] {
    // Models are now loaded from the database via genx-model-registry
    // This returns an empty array - use the registry service instead
    return [];
  }

  async chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<ChatResult> {
    const response = (await this.request('POST', '/chat/completions', {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 4096,
      top_p: options?.top_p ?? 1,
      frequency_penalty: options?.frequency_penalty ?? 0,
      presence_penalty: options?.presence_penalty ?? 0,
      stop: options?.stop,
    })) as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };

    return {
      content: response.choices[0].message.content,
      tokensIn: response.usage?.prompt_tokens || 0,
      tokensOut: response.usage?.completion_tokens || 0,
    };
  }

  async embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]> {
    const response = (await this.request('POST', '/embeddings', {
      model,
      input: Array.isArray(input) ? input : [input],
    })) as { data: Array<{ embedding: number[] }>; usage?: { total_tokens?: number } };

    return response.data.map((item) => ({
      embedding: item.embedding,
      token_count: response.usage?.total_tokens || 0,
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── Image Generation ─────────────────────────────────────────────────────

  async generateImage(prompt: string, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const response = (await this.request('POST', '/images/generations', {
      model,
      prompt,
      n: options?.n || 1,
      size: options?.size || '1024x1024',
      quality: options?.quality || 'standard',
      response_format: 'url',
      ...options,
    })) as { data?: Array<{ url?: string; b64_json?: string }>; id?: string };

    return {
      url: response.data?.[0]?.url || response.data?.[0]?.b64_json || '',
      provider_job_id: response.id,
    };
  }

  async editImage(prompt: string, image: string, mask: string | undefined, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const response = (await this.request('POST', '/images/edits', {
      model,
      prompt,
      image,
      mask,
      n: options?.n || 1,
      size: options?.size || '1024x1024',
      response_format: 'url',
      ...options,
    })) as { data?: Array<{ url?: string }>; id?: string };

    return {
      url: response.data?.[0]?.url || '',
      provider_job_id: response.id,
    };
  }

  async generateVideo(prompt: string, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const response = (await this.request('POST', '/video/generations', {
      model,
      prompt,
      ...options,
    })) as { data?: Array<{ url?: string }>; id?: string; job_id?: string };

    return {
      url: response.data?.[0]?.url || '',
      provider_job_id: response.id || response.job_id,
    };
  }

  // ─── Audio Generation ─────────────────────────────────────────────────────

  async generateAudio(input: string, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const response = (await this.request('POST', '/audio/speech', {
      model,
      input,
      voice: options?.voice || 'alloy',
      response_format: options?.response_format || 'mp3',
      ...options,
    })) as { url?: string; id?: string };

    return {
      url: response.url || '',
      provider_job_id: response.id,
    };
  }

  async transcribeAudio(audio: Buffer | string, model: string, options?: Record<string, unknown>): Promise<{ text: string }> {
    const response = (await this.request('POST', '/audio/transcriptions', {
      model,
      ...options,
    })) as { text?: string };

    return { text: response.text || '' };
  }

  // ─── Job Status ───────────────────────────────────────────────────────────

  async getJobStatus(jobId: string): Promise<{ status: string; progress?: number; output?: unknown }> {
    const response = (await this.request('GET', `/jobs/${jobId}`)) as { status?: string; progress?: number; output?: unknown; result?: unknown };
    return {
      status: response.status || 'unknown',
      progress: response.progress,
      output: response.output || response.result,
    };
  }

  // ─── Shared Request Layer ──────────────────────────────────────────────────

  private async request(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(60000),
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      logger.error(`GenX API error: ${method} ${path} - ${response.status}: ${error}`);
      throw new Error(`GenX API error: ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }
}
