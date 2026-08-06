import { ChatMessage, ChatOptions, ChatResult, EmbeddingResult, ProviderInterface } from '../types';
import { logger } from '../utils/logger';

interface GenXAsyncJob {
  id: string;
  status: string;
  progress?: number;
  result_url?: string;
  result_data?: Record<string, unknown>;
  error?: string;
}

export class GenXProvider implements ProviderInterface {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/(?:api\/v1|v1)$/, '');
  }

  getName(): string {
    return 'genx';
  }

  getModels(): string[] {
    return [];
  }

  async chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<ChatResult> {
    const response = await this.request('/v1/chat/completions', {
      method: 'POST',
      body: {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
        top_p: options?.top_p ?? 1,
        frequency_penalty: options?.frequency_penalty ?? 0,
        presence_penalty: options?.presence_penalty ?? 0,
        stop: options?.stop,
      },
      timeoutMs: 120000,
    }) as Record<string, unknown>;

    const choices = Array.isArray(response.choices) ? response.choices as Array<Record<string, unknown>> : [];
    const first = choices[0] || {};
    const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {};
    const content = typeof message.content === 'string'
      ? message.content
      : typeof first.text === 'string'
        ? first.text
        : '';
    if (!content) throw new Error('GenX chat response contained no assistant content');

    const usage = response.usage && typeof response.usage === 'object' ? response.usage as Record<string, unknown> : {};
    return {
      content,
      tokensIn: Number(usage.prompt_tokens || usage.input_tokens || 0),
      tokensOut: Number(usage.completion_tokens || usage.output_tokens || 0),
    };
  }

  async embeddings(_input: string | string[], _model: string): Promise<EmbeddingResult[]> {
    throw new Error('GenX does not expose an embeddings endpoint in the supported API contract');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateImage(prompt: string, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const job = await this.generateAndWait(model, { prompt, ...options }, 10 * 60 * 1000);
    return { url: this.extractResultUrl(job), provider_job_id: job.id };
  }

  async editImage(prompt: string, image: string, mask: string | undefined, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const job = await this.generateAndWait(model, { prompt, image, mask, ...options }, 10 * 60 * 1000);
    return { url: this.extractResultUrl(job), provider_job_id: job.id };
  }

  async generateVideo(prompt: string, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const job = await this.generateAndWait(model, { prompt, ...options }, 30 * 60 * 1000);
    return { url: this.extractResultUrl(job), provider_job_id: job.id };
  }

  async generateAudio(input: string, model: string, options?: Record<string, unknown>): Promise<{ url: string; provider_job_id?: string }> {
    const job = await this.generateAndWait(model, { input, text: input, ...options }, 10 * 60 * 1000);
    return { url: this.extractResultUrl(job), provider_job_id: job.id };
  }

  async transcribeAudio(audio: Buffer | string, model: string, options?: Record<string, unknown>): Promise<{ text: string }> {
    if (Buffer.isBuffer(audio)) {
      throw new Error('GenX transcription requires an uploaded or publicly accessible audio URL');
    }
    const job = await this.generateAndWait(model, { audio, audio_url: audio, ...options }, 10 * 60 * 1000);
    const data = job.result_data || {};
    const text = String(data.text || data.transcript || data.content || '').trim();
    if (!text) throw new Error('GenX transcription completed without text output');
    return { text };
  }

  async getJobStatus(jobId: string): Promise<{ status: string; progress?: number; output?: unknown }> {
    const job = await this.getJob(jobId);
    return { status: job.status, progress: job.progress, output: job.result_data || job.result_url };
  }

  private async generateAndWait(model: string, params: Record<string, unknown>, maxWaitMs: number): Promise<GenXAsyncJob> {
    const submitted = await this.request('/api/v1/generate', {
      method: 'POST',
      body: { model, params },
      timeoutMs: 120000,
    }) as Record<string, unknown>;
    const payload = submitted.data && typeof submitted.data === 'object'
      ? submitted.data as Record<string, unknown>
      : submitted;
    const jobId = String(payload.id || payload.job_id || '').trim();
    if (!jobId) throw new Error('GenX generation response contained no job ID');

    const immediate = this.normalizeJob({ ...payload, id: jobId });
    if (this.isTerminal(immediate.status)) return this.assertCompleted(immediate);

    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const job = await this.getJob(jobId);
      if (this.isTerminal(job.status)) return this.assertCompleted(job);
    }
    throw new Error(`GenX job ${jobId} timed out`);
  }

  private async getJob(jobId: string): Promise<GenXAsyncJob> {
    const response = await this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      timeoutMs: 30000,
    }) as Record<string, unknown>;
    const payload = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : response;
    const job = this.normalizeJob({ ...payload, id: payload.id || payload.job_id || jobId });

    if (job.status === 'completed' && !job.result_url && !this.hasUsableData(job.result_data)) {
      try {
        const result = await this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/result`, {
          method: 'GET',
          timeoutMs: 30000,
        }) as Record<string, unknown>;
        const resultPayload = result.data && typeof result.data === 'object'
          ? result.data as Record<string, unknown>
          : result;
        job.result_url = String(result.url || result.result_url || result.output_url || resultPayload.url || resultPayload.result_url || resultPayload.output_url || '') || undefined;
        job.result_data = resultPayload;
      } catch (error) {
        logger.warn(`Could not fetch separate GenX result for ${jobId}: ${error}`);
      }
    }
    return job;
  }

  private normalizeJob(data: Record<string, unknown>): GenXAsyncJob {
    const resultData = data.result_data && typeof data.result_data === 'object'
      ? data.result_data as Record<string, unknown>
      : data.result && typeof data.result === 'object'
        ? data.result as Record<string, unknown>
        : data.output && typeof data.output === 'object'
          ? data.output as Record<string, unknown>
          : undefined;
    return {
      id: String(data.id || data.job_id || ''),
      status: this.normalizeStatus(String(data.status || 'queued')),
      progress: data.progress === undefined ? undefined : Number(data.progress),
      result_url: String(data.result_url || data.output_url || resultData?.url || resultData?.result_url || resultData?.output_url || '') || undefined,
      result_data: resultData,
      error: data.error ? String(data.error) : undefined,
    };
  }

  private normalizeStatus(status: string): string {
    const normalized = status.toLowerCase();
    if (['success', 'succeeded', 'complete', 'completed'].includes(normalized)) return 'completed';
    if (['error', 'failed'].includes(normalized)) return 'failed';
    if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
    if (['running', 'processing'].includes(normalized)) return 'processing';
    return 'queued';
  }

  private isTerminal(status: string): boolean {
    return ['completed', 'failed', 'cancelled'].includes(status);
  }

  private assertCompleted(job: GenXAsyncJob): GenXAsyncJob {
    if (job.status !== 'completed') throw new Error(job.error || `GenX job ${job.id} ${job.status}`);
    return job;
  }

  private hasUsableData(data?: Record<string, unknown>): boolean {
    if (!data) return false;
    return Boolean(data.url || data.result_url || data.output_url || data.text || data.transcript || data.content);
  }

  private extractResultUrl(job: GenXAsyncJob): string {
    const data = job.result_data || {};
    const direct = String(job.result_url || data.url || data.result_url || data.output_url || '').trim();
    if (direct) return direct;
    const outputs = Array.isArray(data.outputs) ? data.outputs : Array.isArray(data.data) ? data.data : [];
    for (const value of outputs) {
      if (typeof value === 'string' && value) return value;
      if (value && typeof value === 'object') {
        const row = value as Record<string, unknown>;
        const url = String(row.url || row.result_url || row.output_url || '').trim();
        if (url) return url;
      }
    }
    throw new Error(`GenX job ${job.id} completed without a media URL`);
  }

  private async request(
    path: string,
    options: { method: string; body?: unknown; timeoutMs?: number }
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs || 60000),
    });
    const text = await response.text();
    if (!response.ok) {
      logger.error(`GenX API error: ${options.method} ${path} - ${response.status}: ${text}`);
      throw new Error(`GenX API error ${response.status}: ${text.slice(0, 500) || response.statusText}`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`GenX API returned non-JSON data for ${path}`);
    }
  }
}
