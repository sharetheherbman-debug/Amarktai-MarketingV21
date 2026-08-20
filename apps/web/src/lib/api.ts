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
  private refreshPromise: Promise<boolean> | null = null;

  constructor(private baseURL: string) {}

  private getToken(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem('auth_token');
  }

  private setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('auth_token', token);
    try {
      const persisted = JSON.parse(localStorage.getItem('auth-storage') || '{}') as {
        state?: Record<string, unknown>;
        version?: number;
      };
      if (persisted.state && typeof persisted.state === 'object') {
        persisted.state.token = token;
        persisted.state.isAuthenticated = true;
        localStorage.setItem('auth-storage', JSON.stringify(persisted));
      }
    } catch {
      // The canonical auth_token is enough for the shared request client.
    }
  }

  private clearSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('org_id');
    localStorage.removeItem('auth-storage');
  }

  private getOrganizationId(): string | null {
    if (typeof window === 'undefined') return null;
    const direct = localStorage.getItem('org_id');
    if (direct) return direct;
    try {
      const persisted = JSON.parse(localStorage.getItem('auth-storage') || '{}') as {
        state?: { currentOrganization?: { id?: string } | null };
      };
      const recovered = String(persisted.state?.currentOrganization?.id || '').trim();
      if (recovered) {
        localStorage.setItem('org_id', recovered);
        return recovered;
      }
    } catch {
      // Ignore malformed legacy persisted state; the request will fail closed without an org id.
    }
    return null;
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

  private getHeaders(body?: unknown): HeadersInit {
    const headers: HeadersInit = {};
    if (!this.isFormData(body)) headers['Content-Type'] = 'application/json';
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const organizationId = this.getOrganizationId();
    if (organizationId) headers['X-Organization-Id'] = organizationId;
    return headers;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const endpoint = `${this.baseURL.replace(/\/+$/, '')}/auth/refresh`;
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!response.ok) return false;
        const payload = await response.json().catch(() => null) as { data?: { accessToken?: string } } | null;
        const accessToken = String(payload?.data?.accessToken || '').trim();
        if (!accessToken) return false;
        this.setToken(accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) {
      this.clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
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

  private async request<T>(method: string, endpoint: string, config?: RequestConfig): Promise<T> {
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);
    const body = hasBody ? this.prepareBody(config?.body) : undefined;
    const url = this.buildURL(endpoint, config?.params);

    const perform = () => fetch(url, {
      method,
      credentials: 'include',
      headers: { ...this.getHeaders(body), ...config?.headers },
      body: hasBody ? this.serializeBody(body) : undefined,
    });

    let response = await perform();
    if (response.status === 401 && !endpoint.replace(/^\/+/, '').startsWith('auth/refresh')) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) response = await perform();
    }

    return this.handleResponse<T>(response);
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('GET', endpoint, config);
  }

  async post<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('POST', endpoint, config);
  }

  async put<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('PUT', endpoint, config);
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('DELETE', endpoint, config);
  }

  async patch<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('PATCH', endpoint, config);
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
