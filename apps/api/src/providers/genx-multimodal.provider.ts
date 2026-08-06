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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export class GenXMultimodalProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.GENX_API_KEY;
    this.baseUrl = env.GENX_BASE_URL.replace(/\/$/, '').replace(/\/(?:api\/v1|v1)$/, '');
  }

  async listModels(category?: string): Promise<GenXModel[]> {
    const suffix = category ? `?category=${encodeURIComponent(category)}` : '';
    const raw = await this.request('GET', `/api/v1/models${suffix}`);
    const root = recordValue(raw);
    const data = root.data;
    const dataRecord = recordValue(data);
    const models = arrayValue(raw).length > 0
      ? arrayValue(raw)
      : arrayValue(data).length > 0
        ? arrayValue(data)
        : arrayValue(root.models).length > 0
          ? arrayValue(root.models)
          : arrayValue(dataRecord.models).length > 0
            ? arrayValue(dataRecord.models)
            : arrayValue(dataRecord.items);
    return models.map((model) => this.normalizeModel(recordValue(model))).filter((model) => Boolean(model.id));
  }

  async getModel(modelId: string): Promise<GenXModel> {
    const raw = recordValue(await this.request('GET', `/api/v1/models/${encodeURIComponent(modelId)}`));
    const data = recordValue(raw.data);
    return this.normalizeModel(Object.keys(data).length > 0 ? data : raw);
  }

  async generate(request: GenXGenerateRequest): Promise<GenXJob> {
    const raw = recordValue(await this.request('POST', '/api/v1/generate', {
      model: request.model,
      params: request.params,
      metadata: request.metadata || {},
      webhook_url: request.webhook_url,
    }));
    const data = recordValue(raw.data);
    return this.normalizeJob(Object.keys(data).length > 0 ? data : raw);
  }

  async getJob(jobId: string): Promise<GenXJob> {
    const raw = recordValue(await this.request('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}`));
    const data = recordValue(raw.data);
    return this.normalizeJob(Object.keys(data).length > 0 ? data : raw);
  }

  async getJobResult(jobId: string): Promise<{ url?: string; data?: Record<string, unknown> }> {
    const raw = recordValue(await this.request('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}/result`));
    const data = recordValue(raw.data);
    const payload = Object.keys(data).length > 0 ? data : raw;
    return {
      url: String(raw.url || raw.result_url || raw.output_url || payload.url || payload.result_url || payload.output_url || '') || undefined,
      data: payload,
    };
  }

  async downloadJobFile(jobId: string): Promise<{ url: string; filename?: string }> {
    const raw = recordValue(await this.request('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}/file`));
    const data = recordValue(raw.data);
    const payload = Object.keys(data).length > 0 ? data : raw;
    const url = String(payload.url || payload.download_url || '');
    if (!url) throw new Error(`GenX job ${jobId} has no downloadable file URL`);
    return { url, filename: payload.filename ? String(payload.filename) : undefined };
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.request('POST', `/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  async uploadFile(filePath: string, filename: string, mimeType: string): Promise<GenXFile> {
    const { readFile } = await import('fs/promises');
    const buffer = await readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    const raw = recordValue(await this.uploadRequest('/api/v1/files', form));
    const data = recordValue(raw.data);
    const payload = Object.keys(data).length > 0 ? data : raw;
    const id = String(payload.id || payload.file_id || '');
    if (!id) throw new Error('GenX upload response contained no file ID');
    return {
      id,
      filename: String(payload.filename || filename),
      mime_type: String(payload.mime_type || payload.content_type || mimeType),
      size: Number(payload.size || payload.size_bytes || buffer.length),
      url: payload.url ? String(payload.url) : undefined,
      created_at: String(payload.created_at || new Date().toISOString()),
    };
  }

  async getFile(fileId: string): Promise<GenXFile> {
    const raw = recordValue(await this.request('GET', `/api/v1/files/${encodeURIComponent(fileId)}`));
    const data = recordValue(raw.data);
    const payload = Object.keys(data).length > 0 ? data : raw;
    return {
      id: String(payload.id || payload.file_id || fileId),
      filename: String(payload.filename || ''),
      mime_type: String(payload.mime_type || payload.content_type || ''),
      size: Number(payload.size || payload.size_bytes || 0),
      url: payload.url ? String(payload.url) : undefined,
      created_at: String(payload.created_at || ''),
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request('DELETE', `/api/v1/files/${encodeURIComponent(fileId)}`);
  }

  async waitForJob(jobId: string, options?: { maxWaitMs?: number; pollIntervalMs?: number; signal?: AbortSignal }): Promise<GenXJob> {
    const maxWait = options?.maxWaitMs || 300000;
    const interval = options?.pollIntervalMs || 3000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      if (options?.signal?.aborted) throw new Error('Polling cancelled');
      const job = await this.getJob(jobId);
      if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`GenX job ${jobId} polling timed out`);
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

  private normalizeModel(model: Record<string, unknown>): GenXModel {
    return {
      id: String(model.id || model.model_id || model.slug || ''),
      name: String(model.name || model.display_name || model.id || model.model_id || ''),
      category: String(model.category || model.type || this.inferCategory(model)),
      vendor: model.vendor || model.provider ? String(model.vendor || model.provider) : undefined,
      inputs: arrayValue(model.inputs).map(String),
      outputs: arrayValue(model.outputs).map(String),
      operations: arrayValue(model.operations || model.capabilities).map(String),
      parameters: recordValue(model.parameters || model.input_schema || model.schema),
      available: model.available !== false && model.status !== 'unavailable',
      deprecated: model.deprecated === true || model.status === 'deprecated',
      metadata: model,
    };
  }

  private normalizeJob(data: Record<string, unknown>): GenXJob {
    const resultData = recordValue(data.result_data || data.result || data.output);
    return {
      id: String(data.id || data.job_id || data.request_id || ''),
      model: String(data.model || data.model_id || ''),
      status: this.normalizeStatus(String(data.status || 'queued')),
      progress: data.progress === undefined ? undefined : Number(data.progress),
      result_url: String(data.result_url || data.output_url || resultData.url || resultData.result_url || resultData.output_url || '') || undefined,
      result_data: Object.keys(resultData).length > 0 ? resultData : undefined,
      error: data.error ? String(data.error) : data.error_message ? String(data.error_message) : undefined,
      usage: recordValue(data.usage) as { tokens?: number; cost?: number },
      metadata: recordValue(data.metadata),
      created_at: data.created_at ? String(data.created_at) : undefined,
      completed_at: data.completed_at ? String(data.completed_at) : undefined,
    };
  }

  private normalizeStatus(status: string): GenXJob['status'] {
    const map: Record<string, GenXJob['status']> = {
      pending: 'queued', queued: 'queued', processing: 'processing', running: 'processing',
      completed: 'completed', complete: 'completed', succeeded: 'completed', success: 'completed',
      failed: 'failed', error: 'failed', cancelled: 'cancelled', canceled: 'cancelled',
    };
    return map[status.toLowerCase()] || 'queued';
  }

  private inferCategory(model: Record<string, unknown>): string {
    const id = String(model.id || model.model_id || '').toLowerCase();
    if (id.includes('image') || id.includes('dall') || id.includes('flux') || id.includes('sdxl')) return 'image';
    if (id.includes('video') || id.includes('sora') || id.includes('runway') || id.includes('seedance')) return 'video';
    if (id.includes('whisper') || id.includes('tts') || id.includes('voice') || id.includes('speech')) return 'voice';
    if (id.includes('audio') || id.includes('music')) return 'audio';
    return 'text';
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(method === 'GET' ? 60000 : 120000),
    });
    const text = await response.text();
    if (!response.ok) {
      logger.error(`GenX API error: ${method} ${path} - ${response.status}: ${text}`);
      throw new Error(`GenX API error ${response.status}: ${text.slice(0, 500) || response.statusText}`);
    }
    if (!text) return {};
    try { return JSON.parse(text) as unknown; }
    catch { throw new Error(`GenX API returned non-JSON data for ${path}`); }
  }

  private async uploadRequest(path: string, form: FormData): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`GenX upload error ${response.status}: ${text.slice(0, 500)}`);
    if (!text) return {};
    try { return JSON.parse(text) as unknown; }
    catch { throw new Error('GenX upload returned non-JSON data'); }
  }
}

export const genxMultimodalProvider = new GenXMultimodalProvider();
