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
  properties?: Record<string, unknown> & { product_line?: ProductLine };
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
  products?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
  plans?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
  pricing?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
  features?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
  offers?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
  promotions?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
  status_changes?: Array<Record<string, unknown> & { product_line?: ProductLine }>;
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
}

export interface ConnectorResponse<T> {
  status: number;
  data: T;
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

export class ApplicationConnectorClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ConnectorClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
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

  private async post<T>(path: string, body: unknown): Promise<ConnectorResponse<T>> {
    const now = this.options.now?.() ?? new Date();
    const nonce = this.options.nonce?.() ?? randomBytes(24).toString('base64url');
    const response = await this.fetchImplementation(`${this.options.baseUrl.replace(/\/$/, '')}/api/v1/application-connectors${path}`, {
      method: 'POST',
      headers: { ...createSignedHeaders(this.options.applicationId, this.options.connectorKey, body, now, nonce) },
      body: JSON.stringify(body),
    });
    const parsed = await response.json() as { success?: boolean; data?: T; error?: { message?: string } };
    if (!response.ok || !parsed.success) {
      throw new Error(parsed.error?.message || `Application Connector request failed with HTTP ${response.status}`);
    }
    return { status: response.status, data: parsed.data as T };
  }
}
