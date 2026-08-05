import { logger } from '../utils/logger';
import { env } from '../config/env';

export interface GenXJob {
  id: string;
  model: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  result_url?: string;
  result_data?: Record<string, unknown>;
  error?: string;
  usage?: { tokens?: number; cost?: number };
  metadata?: Record<string, unknown>;
  created_at?: string;
  completed_at?: string;
}

export interface GenXModel {
  id: string;
  name: string;
  category: string;
  vendor?: string;
  inputs?: string[];
  outputs?: string[];
  operations?: string[];
  parameters?: Record<string, unknown>;
  available?: boolean;
  deprecated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GenXGenerateRequest {
  model: string;
  params: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  webhook_url?: string;
}

export interface GenXFile {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  url?: string;
  created_at: string;
}

export class GenXMultimodalProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.GENX_API_KEY;
    this.baseUrl = env.GENX_BASE_URL;
  }

  async listModels(category?: string): Promise<GenXModel[]> {
    const params = category ? '?category=' + category : '';
    const raw = (await this.request('GET', '/api/v1/models' + params)) as { data?: unknown[]; models?: unknown[] };
    const models = Array.isArray(raw) ? raw : (raw.data || raw.models || []);
    return models.map((m: unknown) => {
      const model = m as Record<string, unknown>;
      return {
        id: model.id as string,
        name: model.name as string,
        category: (model.category as string) || this.inferCategory(model),
        vendor: (model.vendor || model.provider) as string | undefined,
        inputs: model.inputs as string[] | undefined,
        outputs: model.outputs as string[] | undefined,
        parameters: model.parameters as Record<string, unknown> | undefined,
        available: model.available !== false,
        deprecated: model.deprecated === true,
        metadata: model,
      };
    });
  }

  async getModel(modelId: string): Promise<GenXModel> {
    const raw = (await this.request('GET', '/api/v1/models/' + modelId)) as { data?: Record<string, unknown> };
    const m = (raw.data || raw) as Record<string, unknown>;
    return {
      id: m.id as string,
      name: m.name as string,
      category: (m.category as string) || this.inferCategory(m),
      vendor: (m.vendor || m.provider) as string | undefined,
      inputs: m.inputs as string[] | undefined,
      outputs: m.outputs as string[] | undefined,
      parameters: m.parameters as Record<string, unknown> | undefined,
      available: m.available !== false,
      deprecated: m.deprecated === true,
      metadata: m,
    };
  }

  async generate(request: GenXGenerateRequest): Promise<GenXJob> {
    const raw = (await this.request('POST', '/api/v1/generate', {
      model: request.model,
      params: request.params,
      metadata: request.metadata || {},
      webhook_url: request.webhook_url,
    })) as { data?: Record<string, unknown> };
    return this.normalizeJob((raw.data || raw) as Record<string, unknown>);
  }

  async getJob(jobId: string): Promise<GenXJob> {
    const raw = (await this.request('GET', '/api/v1/jobs/' + jobId)) as { data?: Record<string, unknown> };
    return this.normalizeJob((raw.data || raw) as Record<string, unknown>);
  }

  async getJobResult(jobId: string): Promise<{ url?: string; data?: Record<string, unknown> }> {
    const raw = (await this.request('GET', '/api/v1/jobs/' + jobId + '/result')) as Record<string, unknown>;
    return {
      url: (raw.url || raw.result_url) as string | undefined,
      data: (raw.data || raw) as Record<string, unknown>,
    };
  }

  async downloadJobFile(jobId: string): Promise<{ url: string; filename?: string }> {
    const raw = (await this.request('GET', '/api/v1/jobs/' + jobId + '/file')) as Record<string, unknown>;
    return {
      url: (raw.url || raw.download_url || '') as string,
      filename: raw.filename as string | undefined,
    };
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.request('POST', '/api/v1/jobs/' + jobId + '/cancel');
  }

  async uploadFile(filePath: string, filename: string, mimeType: string): Promise<GenXFile> {
    const fs = await import('fs');
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename, contentType: mimeType });
    const raw = (await this.uploadRequest('/api/v1/files', form)) as Record<string, unknown>;
    return {
      id: (raw.id || '') as string,
      filename: (raw.filename || filename) as string,
      mime_type: (raw.mime_type || mimeType) as string,
      size: (raw.size || 0) as number,
      url: raw.url as string | undefined,
      created_at: (raw.created_at || new Date().toISOString()) as string,
    };
  }

  async getFile(fileId: string): Promise<GenXFile> {
    const raw = (await this.request('GET', '/api/v1/files/' + fileId)) as Record<string, unknown>;
    return {
      id: (raw.id || '') as string,
      filename: (raw.filename || '') as string,
      mime_type: (raw.mime_type || '') as string,
      size: (raw.size || 0) as number,
      url: raw.url as string | undefined,
      created_at: (raw.created_at || '') as string,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request('DELETE', '/api/v1/files/' + fileId);
  }

  async waitForJob(jobId: string, options?: { maxWaitMs?: number; pollIntervalMs?: number; signal?: AbortSignal }): Promise<GenXJob> {
    const maxWait = options?.maxWaitMs || 300000;
    const interval = options?.pollIntervalMs || 3000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      if (options?.signal?.aborted) throw new Error('Polling cancelled');
      const job = await this.getJob(jobId);
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return job;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Job polling timeout');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl + '/v1/models', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private normalizeJob(data: Record<string, unknown>): GenXJob {
    return {
      id: (data.id || data.job_id) as string,
      model: data.model as string,
      status: this.normalizeStatus(data.status as string),
      progress: data.progress as number | undefined,
      result_url: (data.result_url || data.output_url) as string | undefined,
      result_data: data.result_data as Record<string, unknown> | undefined,
      error: data.error as string | undefined,
      usage: data.usage as { tokens?: number; cost?: number } | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
      created_at: data.created_at as string | undefined,
      completed_at: data.completed_at as string | undefined,
    };
  }

  private normalizeStatus(status: string): GenXJob['status'] {
    const map: Record<string, GenXJob['status']> = {
      pending: 'queued', queued: 'queued', processing: 'processing', running: 'processing',
      completed: 'completed', succeeded: 'completed', success: 'completed',
      failed: 'failed', error: 'failed', cancelled: 'cancelled', canceled: 'cancelled',
    };
    return map[status?.toLowerCase()] || 'queued';
  }

  private inferCategory(model: Record<string, unknown>): string {
    const id = ((model.id as string) || '').toLowerCase();
    if (id.includes('image') || id.includes('dall') || id.includes('flux') || id.includes('sdxl')) return 'image';
    if (id.includes('video') || id.includes('sora') || id.includes('runway')) return 'video';
    if (id.includes('whisper') || id.includes('tts') || id.includes('voice')) return 'voice';
    if (id.includes('audio') || id.includes('music')) return 'audio';
    return 'text';
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = this.baseUrl + path;
    const options: RequestInit = {
      method,
      headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
    };
    if (body && method !== 'GET') options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.text();
      logger.error('GenX API error: ' + method + ' ' + path + ' - ' + response.status + ': ' + error);
      throw new Error('GenX API error: ' + response.status);
    }
    return response.json();
  }

  private async uploadRequest(path: string, form: unknown): Promise<unknown> {
    const url = this.baseUrl + path;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.apiKey },
      body: form as any,
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('GenX upload error: ' + response.status);
    return response.json();
  }
}

export const genxMultimodalProvider = new GenXMultimodalProvider();
