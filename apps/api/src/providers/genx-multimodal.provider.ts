import { logger } from '../utils/logger';
import { env } from '../config/env';
import {
  routerParameterContract,
  translateRouterGenerationParams,
} from './genx-router-parameter-contracts';

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

export interface GenXAccountPriceUnit {
  metric: string;
  unit_quantity: number;
  credits: number;
  mcredits: number;
}

export interface GenXAccountPricingModel {
  model: string;
  name: string;
  category: string;
  provider?: string;
  billing_mode?: string;
  pricing: GenXAccountPriceUnit[];
  raw: Record<string, unknown>;
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

/** Provider-neutral structured contract for Marketing ingredient review. */
export interface GenXVisualAssessment {
  subject_relevance: number;
  campaign_relevance: number;
  commercial_usability: number;
  composition_quality: number;
  subject_integrity: number;
  negative_space_usability: number;
  unexpected_text: boolean;
  unexpected_logo: boolean;
  watermark: boolean;
  obvious_ai_artifacts: boolean;
  wrong_product: boolean;
  wrong_subject: boolean;
  brand_safety: boolean;
  rejection_reasons: string[];
  repair_instructions: string[];
}

export interface GenXVisualAssessmentRequest {
  image_url: string;
  brief: Record<string, unknown>;
  technical_qa: Record<string, unknown>;
  instructions: string;
  thresholds: Record<string, number>;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function catalogueItems(raw: unknown): unknown[] {
  const root = recordValue(raw);
  const data = root.data;
  const dataRecord = recordValue(data);
  return arrayValue(raw).length > 0
    ? arrayValue(raw)
    : arrayValue(data).length > 0
      ? arrayValue(data)
      : arrayValue(root.models).length > 0
        ? arrayValue(root.models)
        : arrayValue(root.items).length > 0
          ? arrayValue(root.items)
          : arrayValue(root.results).length > 0
            ? arrayValue(root.results)
            : arrayValue(dataRecord.models).length > 0
              ? arrayValue(dataRecord.models)
              : arrayValue(dataRecord.items).length > 0
                ? arrayValue(dataRecord.items)
                : arrayValue(dataRecord.results);
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
    const items = catalogueItems(raw);
    const models: GenXModel[] = [];

    // The live Router catalogue returns model IDs as strings. Enrich those IDs
    // from the documented model-detail endpoint in modest batches so catalogue
    // refreshes stay below account concurrency limits. Object catalogues remain
    // supported for backwards compatibility.
    const batchSize = 8;
    for (let index = 0; index < items.length; index += batchSize) {
      const batch = items.slice(index, index + batchSize);
      const enriched = await Promise.all(batch.map(async (item) => {
        if (typeof item === 'string' && item.trim()) {
          const modelId = item.trim();
          try {
            const detail = await this.getModel(modelId);
            return {
              ...detail,
              category: detail.category || category || this.inferCategory({ model: modelId }),
            };
          } catch (error) {
            logger.warn(`GenX model detail unavailable for ${modelId}; retaining catalogue identity: ${error}`);
            return this.normalizeModel({ model: modelId, category: category || '' }, category);
          }
        }
        return this.normalizeModel(recordValue(item), category);
      }));
      models.push(...enriched.filter((model) => Boolean(model.id)));
    }

    return models;
  }

  async listAccountPricing(category?: string): Promise<GenXAccountPricingModel[]> {
    const suffix = category ? `?category=${encodeURIComponent(category)}` : '';
    const raw = await this.request('GET', `/api/v1/account/pricing${suffix}`);
    const items = catalogueItems(raw);

    return items.map((item) => {
      const record = recordValue(item);
      const model = String(record.model || record.model_id || record.id || '').trim();
      const pricing = arrayValue(record.pricing).map((row) => {
        const price = recordValue(row);
        return {
          metric: String(price.metric || '').trim(),
          unit_quantity: Number(price.unit_quantity || 0),
          credits: Number(price.credits || 0),
          mcredits: Number(price.mcredits || 0),
        };
      }).filter((row) => (
        Boolean(row.metric) &&
        Number.isFinite(row.unit_quantity) && row.unit_quantity > 0 &&
        Number.isFinite(row.credits) && row.credits >= 0 &&
        Number.isFinite(row.mcredits) && row.mcredits >= 0
      ));

      return {
        model,
        name: String(record.name || model),
        category: String(record.category || category || ''),
        provider: record.provider ? String(record.provider) : undefined,
        billing_mode: record.billing_mode ? String(record.billing_mode) : undefined,
        pricing,
        raw: record,
      };
    }).filter((model) => Boolean(model.model));
  }

  async getModel(modelId: string): Promise<GenXModel> {
    const raw = recordValue(await this.request('GET', `/api/v1/models/${encodeURIComponent(modelId)}`));
    const data = recordValue(raw.data);
    return this.normalizeModel(Object.keys(data).length > 0 ? data : raw);
  }

  async generate(request: GenXGenerateRequest): Promise<GenXJob> {
    const raw = recordValue(await this.request('POST', '/api/v1/generate', {
      model: request.model,
      params: translateRouterGenerationParams(request.model, request.params),
      metadata: request.metadata || {},
      webhook_url: request.webhook_url,
    }));
    const data = recordValue(raw.data);
    return this.normalizeJob(Object.keys(data).length > 0 ? data : raw);
  }

  /**
   * Marketing visual QA uses the canonical GenX multimodal boundary. The live
   * deployment adapter maps this stable request to the configured vision route;
   * callers validate every field and fail closed if its response is incomplete.
   */
  async assessVisual(request: GenXVisualAssessmentRequest): Promise<GenXVisualAssessment> {
    const raw = recordValue(await this.request('POST', '/api/v1/analyze', {
      task: 'marketing_visual_quality_assessment',
      image_url: request.image_url,
      brief: request.brief,
      technical_qa: request.technical_qa,
      instructions: request.instructions,
      thresholds: request.thresholds,
      response_format: 'marketing_visual_assessment_v1',
    }));
    const data = recordValue(raw.data);
    const assessment = recordValue(data.assessment || data.result || data);
    return assessment as unknown as GenXVisualAssessment;
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

  private normalizeModel(model: Record<string, unknown>, categoryHint = ''): GenXModel {
    const id = String(model.id || model.model_id || model.model || model.slug || '');
    const category = String(model.category || model.type || categoryHint || this.inferCategory(model));
    const explicitParameters = recordValue(model.parameters || model.input_schema || model.schema);
    const explicitOperations = arrayValue(model.operations || model.capabilities).map(String);
    const fallbackContract = routerParameterContract(id, category);
    const parameters = Object.keys(explicitParameters).length > 0
      ? explicitParameters
      : fallbackContract?.parameters || {};
    const operations = explicitOperations.length > 0
      ? explicitOperations
      : fallbackContract?.operations || [];

    return {
      id,
      name: String(model.name || model.display_name || id),
      category,
      vendor: model.vendor || model.provider ? String(model.vendor || model.provider) : undefined,
      inputs: arrayValue(model.inputs).map(String),
      outputs: arrayValue(model.outputs).map(String),
      operations,
      parameters,
      available: (
        model.available !== false &&
        model.is_active !== false &&
        Number(model.is_active ?? 1) !== 0 &&
        model.status !== 'unavailable'
      ),
      deprecated: model.deprecated === true || model.status === 'deprecated' || Boolean(model.retired_at),
      metadata: {
        ...model,
        parameter_contract_source: Object.keys(explicitParameters).length > 0
          ? 'router_model_detail'
          : fallbackContract
            ? 'documented_launch_fallback'
            : 'none',
      },
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
    const id = String(model.id || model.model_id || model.model || '').toLowerCase();
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
    try { return JSON.parse(text) as unknown;
    } catch { throw new Error(`GenX API returned non-JSON data for ${path}`); }
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
    try { return JSON.parse(text) as unknown;
    } catch { throw new Error('GenX upload returned non-JSON data'); }
  }
}

export const genxMultimodalProvider = new GenXMultimodalProvider();
