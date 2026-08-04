const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  private buildURL(endpoint: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseURL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
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
        errorData?.message || 'An error occurred',
        response.status,
        errorData?.errors
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildURL(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...this.getHeaders(), ...config?.headers },
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildURL(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...this.getHeaders(), ...config?.headers },
      body: config?.body ? JSON.stringify(config.body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildURL(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { ...this.getHeaders(), ...config?.headers },
      body: config?.body ? JSON.stringify(config.body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildURL(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { ...this.getHeaders(), ...config?.headers },
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildURL(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...this.getHeaders(), ...config?.headers },
      body: config?.body ? JSON.stringify(config.body) : undefined,
    });
    return this.handleResponse<T>(response);
  }
}

class ApiErrorImpl extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export const api = new ApiClient(API_BASE_URL);
export { ApiErrorImpl as ApiError };
export type { ApiError as ApiErrorType };
