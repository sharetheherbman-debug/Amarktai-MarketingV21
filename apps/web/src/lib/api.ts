function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}

const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

interface RequestConfig extends Omit<RequestInit, 'body'> {
  params?: Record<string, string>;
  body?: unknown;
}

interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
}

class ApiClient {
  constructor(private baseURL: string) {}

  private getToken(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem('auth_token');
  }

  private getOrganizationId(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem('org_id');
  }

  private isFormData(value: unknown): value is FormData {
    return typeof FormData !== 'undefined' && value instanceof FormData;
  }

  private buildURL(endpoint: string, params?: Record<string, string>): string {
    const joined = `${this.baseURL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    const isAbsolute = /^https?:\/\//i.test(joined);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(joined, origin);
    const merged = { ...(params || {}) };
    const organizationId = this.getOrganizationId();
    if (organizationId && !merged.organization_id) merged.organization_id = organizationId;
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.append(key, String(value));
    }
    if (isAbsolute) return url.toString();
    return `${url.pathname}${url.search}${url.hash}`;
  }

  private prepareBody(body: unknown): unknown {
    const organizationId = this.getOrganizationId();
    if (!organizationId || !body || typeof body !== 'object' || Array.isArray(body)) return body;
    if (this.isFormData(body)) {
      if (!body.has('organization_id')) body.append('organization_id', organizationId);
      return body;
    }
    const record = body as Record<string, unknown>;
    return record.organization_id ? record : { ...record, organization_id: organizationId };
  }

  private serializeBody(body: unknown): BodyInit | undefined {
    if (body === undefined || body === null) return undefined;
    if (this.isFormData(body)) return body;
    return JSON.stringify(body);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
      throw new ApiErrorImpl('Unauthorized', 401);
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new ApiErrorImpl(
        errorData?.error?.message || errorData?.message || response.statusText || 'An error occurred',
        response.status,
        errorData?.error?.details || errorData?.errors
      );
    }
    if (response.status === 204) return {} as T;
    return response.json();
  }

  private getHeaders(body?: unknown): HeadersInit {
    const headers: HeadersInit = {};
    if (!this.isFormData(body)) headers['Content-Type'] = 'application/json';
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const organizationId = this.getOrganizationId();
    if (organizationId) headers['X-Organization-Id'] = organizationId;
    return headers;
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'GET', headers: { ...this.getHeaders(), ...config?.headers } });
    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const body = this.prepareBody(config?.body);
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'POST', headers: { ...this.getHeaders(body), ...config?.headers }, body: this.serializeBody(body) });
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const body = this.prepareBody(config?.body);
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'PUT', headers: { ...this.getHeaders(body), ...config?.headers }, body: this.serializeBody(body) });
    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'DELETE', headers: { ...this.getHeaders(), ...config?.headers } });
    return this.handleResponse<T>(response);
  }

  async patch<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const body = this.prepareBody(config?.body);
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'PATCH', headers: { ...this.getHeaders(body), ...config?.headers }, body: this.serializeBody(body) });
    return this.handleResponse<T>(response);
  }
}

class ApiErrorImpl extends Error {
  constructor(message: string, public status: number, public errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient(API_BASE_URL);
export { ApiErrorImpl as ApiError };
export type { ApiError as ApiErrorType };
