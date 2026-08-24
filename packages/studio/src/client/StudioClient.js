"use client";

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}

const API_BASE = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('Polling cancelled'));
      };
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}

export class StudioClient {
  constructor({ organizationId, getToken } = {}) {
    this.organizationId = organizationId;
    this.getToken = getToken;
    this.refreshPromise = null;
  }

  getHeaders(json = true) {
    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (this.organizationId) headers['X-Organization-Id'] = this.organizationId;
    const token = this.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async refreshSession() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  async request(method, path, body) {
    const perform = () => fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: this.getHeaders(true),
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    let response = await perform();
    if (response.status === 401 && path !== '/auth/refresh' && await this.refreshSession()) {
      response = await perform();
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const requestError = new Error(error.error?.message || error.message || `API error: ${response.status}`);
      requestError.status = response.status;
      const retryAfter = Number(response.headers.get('Retry-After'));
      requestError.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
      throw requestError;
    }
    return response.json();
  }

  async listModels(operation) {
    const suffix = operation ? `?operation=${encodeURIComponent(operation)}` : '';
    const result = await this.request('GET', `/studio/models${suffix}`);
    return result.data || [];
  }

  async resolveModel(operation, requestedModel) {
    this.modelCache ||= new Map();
    if (!this.modelCache.has(operation)) this.modelCache.set(operation, await this.listModels(operation));
    const models = this.modelCache.get(operation) || [];
    const requestedId = typeof requestedModel === 'string' ? requestedModel : requestedModel?.id;
    const requested = models.find((item) => item.id === requestedId);
    return requested?.id || models[0]?.id || requestedId;
  }

  async createGeneration({ type, model, prompt, negative_prompt, options }) {
    const operation = options?.request_id ? 'video_extend' : type === 'cinema' ? 'text_to_video' : type;
    const resolvedModel = await this.resolveModel(operation, model);
    if (!resolvedModel) throw new Error(`No live GenX model is available for ${operation}`);
    const result = await this.request('POST', '/studio/generations', {
      organization_id: this.organizationId,
      type,
      model: resolvedModel,
      prompt,
      negative_prompt,
      options,
    });
    let generation = this.normalizeGeneration(result.data);
    if (generation?.id && !generation.url && !['completed', 'failed', 'cancelled'].includes(generation.status)) {
      const isLongRunning = type.includes('video') || type === 'cinema' || type === 'lip_sync';
      generation = await this.waitForGeneration(generation.id, {
        maxWaitMs: isLongRunning ? 20 * 60 * 1000 : 10 * 60 * 1000,
      });
    }
    return generation;
  }

  async getGeneration(id) {
    const result = await this.request(
      'GET',
      `/studio/generations/${encodeURIComponent(id)}?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return this.normalizeGeneration(result.data);
  }

  normalizeGeneration(generation) {
    if (!generation) return null;
    return {
      ...generation,
      url: generation.primary_output_url || generation.output_urls?.[0] || null,
    };
  }

  async cancelGeneration(id) {
    const result = await this.request('POST', `/studio/generations/${encodeURIComponent(id)}/cancel`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async listHistory(limit = 100) {
    const result = await this.request(
      'GET',
      `/studio/history?organization_id=${encodeURIComponent(this.organizationId)}&limit=${limit}`
    );
    return (result.data || []).map((generation) => this.normalizeGeneration(generation));
  }

  async waitForGeneration(generationId, options = {}) {
    const { signal, pollIntervalMs = 4000, maxWaitMs = 300000, onProgress } = options;
    const startedAt = Date.now();
    let transientFailures = 0;

    while (Date.now() - startedAt < maxWaitMs) {
      if (signal?.aborted) throw new Error('Polling cancelled');
      try {
        const generation = await this.getGeneration(generationId);
        transientFailures = 0;
        onProgress?.(generation);
        if (generation.status === 'completed') {
          if (!generation.url) throw new Error('Generation completed without a media output');
          return generation;
        }
        if (generation.status === 'failed') throw new Error(generation.error_message || 'Generation failed');
        if (generation.status === 'cancelled') throw new Error('Generation was cancelled');
        const hiddenDelay = typeof document !== 'undefined' && document.hidden ? 12000 : pollIntervalMs;
        await delay(hiddenDelay + Math.floor(Math.random() * 500), signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message === 'Polling cancelled' ||
          message === 'Generation was cancelled' ||
          message === 'Generation failed' ||
          message.includes('completed without')
        ) throw error;
        const rateLimited = error?.status === 429;
        transientFailures += 1;
        if (transientFailures > 6) throw error;
        const retryDelay = rateLimited && error.retryAfterMs
          ? error.retryAfterMs
          : Math.min(pollIntervalMs * 2 ** transientFailures, 30000);
        await delay(retryDelay + Math.floor(Math.random() * 750), signal);
      }
    }
    throw new Error('Generation polling timeout');
  }

  async resumePendingGenerations(onUpdate) {
    const history = await this.listHistory();
    const pending = history.filter((item) => ['pending', 'queued', 'processing'].includes(item.status));
    return Promise.allSettled(
      pending.map((item) => this.waitForGeneration(item.id, {
        maxWaitMs: item.type?.includes('video') ? 20 * 60 * 1000 : 10 * 60 * 1000,
        onProgress: onUpdate,
      }))
    );
  }

  async uploadAsset(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(
      `${API_BASE}/studio/organizations/${encodeURIComponent(this.organizationId)}/uploads`,
      { method: 'POST', credentials: 'include', headers: this.getHeaders(false), body: formData }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `Upload error: ${response.status}`);
    }
    const payload = await response.json();
    return payload.data || payload;
  }

  async listLongFormProjects() {
    const result = await this.request('GET', `/longform-video/projects?organization_id=${encodeURIComponent(this.organizationId)}`);
    return result.data || [];
  }

  async getLongFormProject(projectId) {
    const result = await this.request(
      'GET',
      `/longform-video/projects/${encodeURIComponent(projectId)}?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return result.data;
  }

  async createLongFormProject(data) {
    const result = await this.request('POST', '/longform-video/projects', { ...data, organization_id: this.organizationId });
    return result.data;
  }

  async updateLongFormProject(projectId, data) {
    const result = await this.request('PUT', `/longform-video/projects/${encodeURIComponent(projectId)}/production-settings`, {
      ...data,
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async deleteLongFormProject(projectId) {
    return this.request(
      'DELETE',
      `/longform-video/projects/${encodeURIComponent(projectId)}?organization_id=${encodeURIComponent(this.organizationId)}`
    );
  }

  async generateStoryboard(projectId, data) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/storyboard/generate`, {
      ...data,
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async listScenes(projectId) {
    const result = await this.request(
      'GET',
      `/longform-video/projects/${encodeURIComponent(projectId)}/scenes?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return result.data || [];
  }

  async addScene(projectId, data) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/scenes`, {
      ...data,
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async updateScene(sceneId, data) {
    const result = await this.request('PUT', `/longform-video/scenes/${encodeURIComponent(sceneId)}`, {
      ...data,
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async duplicateScene(projectId, sceneId) {
    const result = await this.request(
      'POST',
      `/longform-video/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/duplicate`,
      { organization_id: this.organizationId }
    );
    return result.data;
  }

  async reorderScenes(projectId, sceneIds) {
    const result = await this.request(
      'PUT',
      `/longform-video/projects/${encodeURIComponent(projectId)}/scenes/reorder`,
      { organization_id: this.organizationId, scene_ids: sceneIds }
    );
    return result.data;
  }

  async deleteScene(sceneId) {
    return this.request(
      'DELETE',
      `/longform-video/scenes/${encodeURIComponent(sceneId)}?organization_id=${encodeURIComponent(this.organizationId)}`
    );
  }

  async deriveCaptions(projectId, settings = {}) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/captions/derive`, {
      ...settings,
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async applyContinuity(projectId, settings = {}) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/continuity/apply`, {
      ...settings,
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async generateScene(sceneId) {
    const result = await this.request('POST', `/longform-video/scenes/${encodeURIComponent(sceneId)}/generate`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async generateProject(projectId) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/generate`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async quoteProject(projectId) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/quote`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async cancelProjectGeneration(projectId) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/cancel`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async retryFailedScenes(projectId) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/retry-failed`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async getProjectProgress(projectId) {
    const result = await this.request(
      'GET',
      `/longform-video/projects/${encodeURIComponent(projectId)}/progress?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return result.data;
  }

  async createRender(projectId) {
    const result = await this.request('POST', `/longform-video/projects/${encodeURIComponent(projectId)}/renders`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async listRenders(projectId) {
    const result = await this.request(
      'GET',
      `/longform-video/projects/${encodeURIComponent(projectId)}/renders?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return result.data || [];
  }

  async getRender(renderId) {
    const result = await this.request(
      'GET',
      `/longform-video/renders/${encodeURIComponent(renderId)}?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return result.data;
  }

  async cancelRender(renderId) {
    const result = await this.request('POST', `/longform-video/renders/${encodeURIComponent(renderId)}/cancel`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async getRenderEvents(renderId) {
    const result = await this.request(
      'GET',
      `/longform-video/renders/${encodeURIComponent(renderId)}/events?organization_id=${encodeURIComponent(this.organizationId)}`
    );
    return result.data || [];
  }
}

export default StudioClient;
