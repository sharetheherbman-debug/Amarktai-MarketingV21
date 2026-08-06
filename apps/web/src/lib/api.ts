const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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

  private buildURL(endpoint: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseURL}${endpoint}`);
    const merged = { ...(params || {}) };
    const organizationId = this.getOrganizationId();
    if (organizationId && !merged.organization_id) merged.organization_id = organizationId;
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.append(key, String(value));
    }
    return url.toString();
  }

  private prepareBody(body: unknown): unknown {
    const organizationId = this.getOrganizationId();
    if (!organizationId || !body || typeof body !== 'object' || Array.isArray(body) || body instanceof FormData) return body;
    const record = body as Record<string, unknown>;
    return record.organization_id ? record : { ...record, organization_id: organizationId };
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

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
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
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'POST', headers: { ...this.getHeaders(), ...config?.headers }, body: body ? JSON.stringify(body) : undefined });
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const body = this.prepareBody(config?.body);
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'PUT', headers: { ...this.getHeaders(), ...config?.headers }, body: body ? JSON.stringify(body) : undefined });
    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'DELETE', headers: { ...this.getHeaders(), ...config?.headers } });
    return this.handleResponse<T>(response);
  }

  async patch<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const body = this.prepareBody(config?.body);
    const response = await fetch(this.buildURL(endpoint, config?.params), { method: 'PATCH', headers: { ...this.getHeaders(), ...config?.headers }, body: body ? JSON.stringify(body) : undefined });
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
