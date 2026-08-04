import { ChatMessage, ChatOptions, ChatResult, EmbeddingResult, ProviderInterface } from '../types';
import { logger } from '../utils/logger';

export class GenXProvider implements ProviderInterface {
  private apiKey: string;
  private baseUrl: string;
  private models: string[] = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'gemini-pro',
    'llama-3.1-70b',
    'mixtral-8x7b',
  ];

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  getName(): string {
    return 'genx';
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
      logger.error(`GenX chat error: ${error}`);
      throw new Error(`GenX API error: ${response.status}`);
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
      logger.error(`GenX embeddings error: ${error}`);
      throw new Error(`GenX API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.data.map((item: any) => ({
      embedding: item.embedding,
      token_count: data.usage?.total_tokens || 0,
    }));
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
