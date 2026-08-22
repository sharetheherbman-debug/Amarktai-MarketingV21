import { createHmac, randomBytes } from 'node:crypto';

export type ProductLine = string;

export interface ConversionEventPayload {
  event_id: string;
  event_type: string;
  occurred_at: string;
  external_user_id?: string;
  external_organization_id?: string;
  value_pence?: number;
  currency?: 'GBP';
  consent_basis: 'contract' | 'consent' | 'legitimate_interest' | 'anonymous_aggregate';
  properties?: Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] };
}

export interface BusinessSnapshotPayload {
  snapshot_id: string;
  occurred_at: string;
  app: {
    id: string;
    name: string;
    domain: string;
    description?: string;
    status?: string;
    product_lines?: ProductLine[];
  };
  products?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  plans?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  pricing?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  features?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  offers?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  promotions?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  status_changes?: Array<Record<string, unknown> & { product_line?: ProductLine; product_lines?: ProductLine[] }>;
  authoritative_fields?: string[];
}

export interface SsoIssuePayload {
  external_user_id: string;
  email: string;
  display_name: string;
  external_role: 'admin' | 'superadmin';
  target_path?: string;
}

export interface SignedHeaders {
  'X-Application-Id': string;
  'X-Application-Key': string;
  'X-Application-Timestamp': string;
  'X-Application-Nonce': string;
  'X-Application-Signature': string;
  'Content-Type': 'application/json';
}

export interface ConnectorClientOptions {
  baseUrl: string;
  applicationId: string;
  connectorKey: string;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
  nonce?: () => string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface ConnectorResponse<T> {
  status: number;
  data: T;
}

export class ApplicationConnectorError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code?: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApplicationConnectorError';
  }
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
}

export function signApplicationPayload(key: string, timestamp: string, nonce: string, body: unknown): string {
  return createHmac('sha256', key)
    .update(`${timestamp}\n${nonce}\n${canonicalize(body)}`, 'utf8')
    .digest('hex');
}

export function createSignedHeaders(
  applicationId: string,
  connectorKey: string,
  body: unknown,
  now = new Date(),
  nonce = randomBytes(24).toString('base64url'),
): SignedHeaders {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return {
    'X-Application-Id': applicationId,
    'X-Application-Key': connectorKey,
    'X-Application-Timestamp': timestamp,
    'X-Application-Nonce': nonce,
    'X-Application-Signature': signApplicationPayload(connectorKey, timestamp, nonce, body),
    'Content-Type': 'application/json',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApplicationConnectorClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ConnectorClientOptions) {
    if (!/^https:\/\//i.test(options.baseUrl) && process.env.NODE_ENV === 'production') {
      throw new ApplicationConnectorError('Production Marketing connector URL must use HTTPS', null, 'HTTPS_REQUIRED');
    }
    if (options.connectorKey.length < 32) {
      throw new ApplicationConnectorError('Connector key must be at least 32 characters', null, 'CONNECTOR_KEY_WEAK');
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; application_id: string; application_name: string; connector_version: number }>> {
    return this.post('/health', {});
  }

  async issueSso(payload: SsoIssuePayload): Promise<ConnectorResponse<{ redirect_url: string; expires_in_seconds: number }>> {
    return this.post('/sso/issue', payload);
  }

  async recordConversion(payload: ConversionEventPayload): Promise<ConnectorResponse<{ accepted: boolean; duplicate: boolean }>> {
    return this.post('/events/conversion', payload);
  }

  async recordBusinessSnapshot(payload: BusinessSnapshotPayload): Promise<ConnectorResponse<{ accepted: boolean; duplicate: boolean; version: number; material_change: boolean }>> {
    return this.post('/business-snapshot', payload);
  }

  /** Friendly aliases for host applications. */
  publishConversion(payload: ConversionEventPayload) { return this.recordConversion(payload); }
  publishEvent(payload: ConversionEventPayload) { return this.recordConversion(payload); }
  publishBusinessSnapshot(payload: BusinessSnapshotPayload) { return this.recordBusinessSnapshot(payload); }
  registerOrSyncBusinessSnapshot(payload: BusinessSnapshotPayload) { return this.recordBusinessSnapshot(payload); }

  private async post<T>(path: string, body: unknown): Promise<ConnectorResponse<T>> {
    const maxRetries = Math.max(0, Math.min(this.options.maxRetries ?? 2, 5));
    const timeoutMs = Math.max(1_000, this.options.timeoutMs ?? 15_000);
    const retryDelayMs = Math.max(10, this.options.retryDelayMs ?? 250);
    let lastError: ApplicationConnectorError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      // Every retry gets a fresh timestamp/nonce/signature so replay protection remains valid.
      const now = this.options.now?.() ?? new Date();
      const nonce = this.options.nonce?.() ?? randomBytes(24).toString('base64url');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImplementation(`${this.options.baseUrl.replace(/\/$/, '')}/api/v1/application-connectors${path}`, {
          method: 'POST',
          headers: { ...createSignedHeaders(this.options.applicationId, this.options.connectorKey, body, now, nonce) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const parsed = await response.json().catch(() => ({})) as { success?: boolean; data?: T; error?: { message?: string; code?: string } };
        if (response.ok && parsed.success) {
          return { status: response.status, data: parsed.data as T };
        }
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        lastError = new ApplicationConnectorError(
          parsed.error?.message || `Application Connector request failed with HTTP ${response.status}`,
          response.status,
          parsed.error?.code,
          retryable,
        );
        if (!retryable || attempt === maxRetries) throw lastError;
      } catch (error) {
        if (error instanceof ApplicationConnectorError) {
          if (!error.retryable || attempt === maxRetries) throw error;
          lastError = error;
        } else {
          lastError = new ApplicationConnectorError(
            error instanceof Error ? error.message : 'Application Connector network request failed',
            null,
            'NETWORK_ERROR',
            true,
          );
          if (attempt === maxRetries) throw lastError;
        }
      } finally {
        clearTimeout(timer);
      }
      await sleep(retryDelayMs * 2 ** attempt);
    }
    throw lastError ?? new ApplicationConnectorError('Application Connector request failed', null);
  }
}
