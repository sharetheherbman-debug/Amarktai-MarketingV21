import { query } from '../config/database';
import { safeFetch } from '../utils/safe-fetch';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import crypto from 'crypto';

// Types
export interface OAuthApplication {
  id: string;
  organization_id: string | null;
  user_id: string;
  name: string;
  description: string | null;
  client_id: string;
  redirect_uris: string[];
  scopes: string[];
  is_confidential: boolean;
  status: string;
  created_at: string;
}

export interface DeveloperProfile {
  user_id: string;
  name: string;
  email: string;
  api_keys: ApiKey[];
  oauth_apps: OAuthApplication[];
  usage: Record<string, number>;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── OAuth Applications ──────────────────────────────────────────────────────

export async function createOAuthApp(userId: string, orgId: string | null, data: {
  name: string;
  description?: string;
  redirect_uris: string[];
  scopes?: string[];
  is_confidential?: boolean;
}): Promise<{ app: OAuthApplication; client_secret: string }> {
  const clientId = `amark_${crypto.randomBytes(16).toString('hex')}`;
  const clientSecret = `amark_secret_${crypto.randomBytes(32).toString('hex')}`;
  const secretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');

  const result = await query(
    `INSERT INTO oauth_applications (organization_id, user_id, name, description, client_id, client_secret_hash, redirect_uris, scopes, is_confidential)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [orgId, userId, data.name, data.description || null, clientId, secretHash,
     JSON.stringify(data.redirect_uris), JSON.stringify(data.scopes || []), data.is_confidential ?? true]
  );

  logger.info(`OAuth app created: ${data.name}`);
  return { app: mapOAuthAppRow(result.rows[0]), client_secret: clientSecret };
}

export async function listOAuthApps(userId: string): Promise<OAuthApplication[]> {
  const result = await query(
    'SELECT * FROM oauth_applications WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
    [userId, 'active']
  );
  return result.rows.map(mapOAuthAppRow);
}

export async function getOAuthApp(clientId: string): Promise<OAuthApplication> {
  const result = await query('SELECT * FROM oauth_applications WHERE client_id = $1 AND status = $2', [clientId, 'active']);
  if (result.rows.length === 0) throw new NotFoundError('OAuth application');
  return mapOAuthAppRow(result.rows[0]);
}

export async function deleteOAuthApp(clientId: string, userId: string): Promise<void> {
  await query(
    "UPDATE oauth_applications SET status = 'deleted' WHERE client_id = $1 AND user_id = $2",
    [clientId, userId]
  );
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export async function createApiKey(userId: string, orgId: string, data: {
  name: string;
  scopes?: string[];
  expires_at?: string;
}): Promise<{ key: ApiKey; plain_key: string }> {
  const plainKey = `amark_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const keyPrefix = plainKey.substring(0, 10);

  const result = await query(
    `INSERT INTO api_keys (organization_id, user_id, name, key_hash, key_prefix, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, userId, data.name, keyHash, keyPrefix, JSON.stringify(data.scopes || []), data.expires_at || null]
  );

  logger.info(`API key created: ${data.name}`);
  return { key: mapApiKeyRow(result.rows[0]), plain_key: plainKey };
}

export async function listApiKeys(userId: string, orgId: string): Promise<ApiKey[]> {
  const result = await query(
    'SELECT * FROM api_keys WHERE user_id = $1 AND organization_id = $2 AND is_active = TRUE ORDER BY created_at DESC',
    [userId, orgId]
  );
  return result.rows.map(mapApiKeyRow);
}

export async function revokeApiKey(keyId: string, userId: string): Promise<void> {
  await query('UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND user_id = $2', [keyId, userId]);
}

export async function validateApiKey(plainKey: string): Promise<{ valid: boolean; userId?: string; orgId?: string; scopes?: string[] }> {
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const result = await query(
    `SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = TRUE
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [keyHash]
  );

  if (result.rows.length === 0) return { valid: false };

  const key = result.rows[0];
  await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]);

  return {
    valid: true,
    userId: key.user_id as string,
    orgId: key.organization_id as string,
    scopes: typeof key.scopes === 'string' ? JSON.parse(key.scopes) : (key.scopes as string[]) || [],
  };
}

// ─── Developer Profile ───────────────────────────────────────────────────────

export async function getDeveloperProfile(userId: string): Promise<DeveloperProfile> {
  const [userResult, keysResult, appsResult, usageResult] = await Promise.all([
    query('SELECT name, email FROM users WHERE id = $1', [userId]),
    query('SELECT * FROM api_keys WHERE user_id = $1 AND is_active = TRUE', [userId]),
    query('SELECT * FROM oauth_applications WHERE user_id = $1 AND status = $2', [userId, 'active']),
    query(
      `SELECT metric, SUM(quantity) as total FROM billing_usage
       WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = $1)
       AND period_start >= DATE_TRUNC('month', NOW())
       GROUP BY metric`,
      [userId]
    ),
  ]);

  const usage: Record<string, number> = {};
  for (const row of usageResult.rows) {
    usage[row.metric as string] = parseInt(row.total as string);
  }

  return {
    user_id: userId,
    name: userResult.rows[0]?.name as string || '',
    email: userResult.rows[0]?.email as string || '',
    api_keys: keysResult.rows.map(mapApiKeyRow),
    oauth_apps: appsResult.rows.map(mapOAuthAppRow),
    usage,
  };
}

// ─── Webhook Tester ──────────────────────────────────────────────────────────

export async function testWebhook(url: string, payload: Record<string, unknown>, headers?: Record<string, string>): Promise<{
  success: boolean;
  status: number | null;
  response_body: string | null;
  latency_ms: number;
  error: string | null;
}> {
  const start = Date.now();
  try {
    const response = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      timeoutMs: 10000,
      maxResponseBytes: 1024 * 1024,
    });
    const body = await response.text();

    return {
      success: response.ok,
      status: response.status,
      response_body: body.substring(0, 1000),
      latency_ms: Date.now() - start,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      status: null,
      response_body: null,
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── SDK Info ────────────────────────────────────────────────────────────────

export function getSdkInfo(): Record<string, unknown> {
  return {
    typescript: {
      package: '@amarktai/sdk',
      version: '1.0.0',
      install: 'npm install @amarktai/sdk',
      docs: 'https://docs.amarktai.co.za/sdk/typescript',
    },
    rest: {
      base_url: 'https://api.amarktai.co.za/v1',
      auth: 'Bearer token or API key',
      docs: 'https://docs.amarktai.co.za/api',
    },
    webhooks: {
      docs: 'https://docs.amarktai.co.za/webhooks',
      events: [
        'content.created', 'content.updated', 'content.published',
        'campaign.created', 'campaign.completed',
        'contact.created', 'contact.updated',
        'deal.created', 'deal.won', 'deal.lost',
        'invoice.paid', 'invoice.overdue',
        'subscription.created', 'subscription.canceled',
      ],
    },
    examples: {
      github: 'https://github.com/amarktai/amarktai-sdk-examples',
      quickstart: 'https://docs.amarktai.co.za/quickstart',
    },
  };
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapOAuthAppRow(row: Record<string, unknown>): OAuthApplication {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string | null,
    user_id: row.user_id as string,
    name: row.name as string,
    description: row.description as string | null,
    client_id: row.client_id as string,
    redirect_uris: typeof row.redirect_uris === 'string' ? JSON.parse(row.redirect_uris) : (row.redirect_uris as string[]) || [],
    scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes as string[]) || [],
    is_confidential: row.is_confidential as boolean,
    status: row.status as string,
    created_at: row.created_at as string,
  };
}

function mapApiKeyRow(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    name: row.name as string,
    key_prefix: row.key_prefix as string,
    scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes as string[]) || [],
    last_used_at: row.last_used_at as string | null,
    expires_at: row.expires_at as string | null,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
  };
}
