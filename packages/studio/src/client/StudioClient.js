"use client";

/**
 * AmarktAI Studio Client
 * Provider-neutral client that calls the AmarktAI backend API.
 * No provider secrets are exposed to the browser.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export class StudioClient {
  constructor({ organizationId, getToken } = {}) {
    this.organizationId = organizationId;
    this.getToken = getToken;
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async request(method, path, body) {
    const url = `${API_BASE}/v1${path}`;
    const options = {
      method,
      headers: this.getHeaders(),
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }
    return response.json();
  }

  async listModels() {
    const result = await this.request('GET', '/studio/models');
    return result.data || [];
  }

  async createGeneration({ type, model, prompt, negative_prompt, options }) {
    const result = await this.request('POST', '/studio/generations', {
      organization_id: this.organizationId,
      type,
      model,
      prompt,
      negative_prompt,
      options,
    });
    return this.normalizeGeneration(result.data);
  }

  async getGeneration(id) {
    const result = await this.request('GET', `/studio/generations/${id}?organization_id=${this.organizationId}`);
    return this.normalizeGeneration(result.data);
  }

  normalizeGeneration(gen) {
    if (!gen) return null;
    return {
      ...gen,
      url: gen.primary_output_url || gen.output_urls?.[0] || null,
    };
  }

  async cancelGeneration(id) {
    const result = await this.request('POST', `/studio/generations/${id}/cancel`, {
      organization_id: this.organizationId,
    });
    return result.data;
  }

  async listHistory(limit = 50) {
    const result = await this.request('GET', `/studio/history?organization_id=${this.organizationId}&limit=${limit}`);
    return (result.data || []).map(gen => this.normalizeGeneration(gen));
  }

  async uploadAsset(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('organization_id', this.organizationId);

    const token = this.getToken?.();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/v1/studio/uploads`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `Upload error: ${response.status}`);
    }
    return response.json();
  }
}

export default StudioClient;
