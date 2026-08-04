import { ChatMessage, ChatOptions, ChatResult, EmbeddingResult, ImageGenerateOptions, ProviderInterface } from '../types';
import { logger } from '../utils/logger';

export class TogetherProvider implements ProviderInterface {
  private apiKey: string;
  private baseUrl: string;
  private models: string[] = [
    'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    'mistralai/Mixtral-8x22B-Instruct-v0.1',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2-72B-Instruct',
    'google/gemma-2-27b-it',
    'deepseek-ai/deepseek-llm-67b-chat',
  ];

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  getName(): string {
    return 'together';
  }

  getModels(): string[] {
    return this.models;
  }

  async chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
        top_p: options?.top_p ?? 1,
        frequency_penalty: options?.frequency_penalty ?? 0,
        presence_penalty: options?.presence_penalty ?? 0,
        stop: options?.stop,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Together chat error: ${error}`);
      throw new Error(`Together API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return {
      content: data.choices[0].message.content,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  }

  async embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: Array.isArray(input) ? input : [input],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Together embeddings error: ${error}`);
      throw new Error(`Together API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.data.map((item: any) => ({
      embedding: item.embedding,
      token_count: data.usage?.total_tokens || 0,
    }));
  }

  async imageGenerate(prompt: string, model: string, options?: ImageGenerateOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size: options?.size ?? '1024x1024',
        quality: options?.quality ?? 'standard',
        n: options?.n ?? 1,
        style: options?.style ?? 'vivid',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`Together image error: ${error}`);
      throw new Error(`Together API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.data[0].url;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
