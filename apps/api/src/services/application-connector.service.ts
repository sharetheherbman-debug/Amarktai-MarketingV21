import crypto from 'crypto';
import type { Request } from 'express';
import { query, transaction } from '../config/database';
import { env } from '../config/env';
import { AppError, UnauthorizedError } from '../middleware/errorHandler';
import { hashPassword } from '../utils/encryption';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { logger } from '../utils/logger';

export interface TrustedApplication {
  applicationId: string;
  connectorId: string;
  name: string;
  baseUrl: string;
}

export interface SsoIssuePayload {
  external_user_id: string;
  email: string;
  display_name: string;
  external_role: 'admin' | 'superadmin';
  target_path?: string;
}

export interface ConversionEventPayload {
  event_id: string;
  event_type: string;
  occurred_at: string;
  external_user_id?: string;
  external_organization_id?: string;
  value_pence?: number;
  currency?: 'GBP';
  consent_basis: 'contract' | 'consent' | 'legitimate_interest' | 'anonymous_aggregate';
  properties?: Record<string, unknown>;
}

function requiredConnectorValue(key: string, developmentDefault = ''): string {
  const value = process.env[key] || developmentDefault;
  if (env.NODE_ENV === 'production' && (!value || value.startsWith('replace-with') || value.length < 32)) {
    throw new Error(`Missing or insecure production connector environment variable: ${key}`);
  }
  return value;
}

function connectorConfig() {
  return {
    signingPepper: requiredConnectorValue('APPLICATION_CONNECTOR_SIGNING_SECRET', 'development-connector-signing-pepper'),
    applicationId: process.env.HOST_APP_ID || process.env.EQUIPROFILE_APP_ID || 'equiprofile',
    applicationName: process.env.HOST_APP_NAME || process.env.EQUIPROFILE_APP_NAME || 'EquiProfile',
    applicationUrl: process.env.HOST_APP_URL || process.env.EQUIPROFILE_APP_URL || 'http://localhost:5000',
    connectorKey: process.env.HOST_APP_CONNECTOR_KEY || requiredConnectorValue('EQUIPROFILE_CONNECTOR_KEY', 'development-equiprofile-connector-key'),
    maxClockSkewSeconds: Number(process.env.APPLICATION_CONNECTOR_MAX_CLOCK_SKEW_SECONDS || 300),
    ssoCodeTtlSeconds: Number(process.env.APPLICATION_SSO_CODE_TTL_SECONDS || 120),
  };
}

function connectorKeyHash(key: string): string {
  return crypto.createHmac('sha256', connectorConfig().signingPepper).update(key, 'utf8').digest('hex');
}

function hashOpaqueValue(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
}

function signedMessage(timestamp: string, nonce: string, body: unknown): string {
  return `${timestamp}\n${nonce}\n${canonicalize(body)}`;
}

export function signApplicationPayload(key: string, timestamp: string, nonce: string, body: unknown): string {
  return crypto.createHmac('sha256', key).update(signedMessage(timestamp, nonce, body), 'utf8').digest('hex');
}

export async function ensureConfiguredEquiProfileConnector(): Promise<void> {
  const config = connectorConfig();
  if (!config.connectorKey && env.NODE_ENV !== 'production') {
    logger.warn('EquiProfile application connector is not configured');
    return;
  }
  await query(
    `INSERT INTO application_connectors (application_id,name,base_url,key_hash,active,metadata)
     VALUES ($1,$2,$3,$4,TRUE,$5)
     ON CONFLICT (application_id) DO UPDATE SET
       name=EXCLUDED.name,
       base_url=EXCLUDED.base_url,
       key_hash=EXCLUDED.key_hash,
       active=TRUE,
       metadata=application_connectors.metadata || EXCLUDED.metadata,
       updated_at=NOW()`,
    [
      config.applicationId,
      config.applicationName,
      config.applicationUrl,
      connectorKeyHash(config.connectorKey),
      JSON.stringify({ managed_by: 'environment', sso_roles: ['admin', 'superadmin'] }),
    ]
  );
  logger.info(`Application connector configured: ${config.applicationId}`);
}

function requiredHeader(req: Request, name: string): string {
  const value = String(req.header(name) || '').trim();
  if (!value) throw new UnauthorizedError(`Missing ${name} connector header`);
  return value;
}

export async function authenticateApplicationRequest(req: Request, body: unknown): Promise<TrustedApplication> {
  const applicationId = requiredHeader(req, 'x-application-id');
  const connectorKey = requiredHeader(req, 'x-application-key');
  const timestamp = requiredHeader(req, 'x-application-timestamp');
  const nonce = requiredHeader(req, 'x-application-nonce');
  const signature = requiredHeader(req, 'x-application-signature');
  const timestampMs = Number(timestamp) * 1000;
  const config = connectorConfig();

  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > config.maxClockSkewSeconds * 1000) {
    throw new UnauthorizedError('Application connector timestamp is outside the allowed window');
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    throw new UnauthorizedError('Application connector nonce is invalid');
  }

  const result = await query(
    'SELECT id,application_id,name,base_url,key_hash FROM application_connectors WHERE application_id=$1 AND active=TRUE',
    [applicationId]
  );
  if (result.rows.length === 0) throw new UnauthorizedError('Unknown or disabled application connector');
  const row = result.rows[0];
  if (!timingSafeHexEqual(String(row.key_hash), connectorKeyHash(connectorKey))) {
    throw new UnauthorizedError('Invalid application connector key');
  }

  const expectedSignature = signApplicationPayload(connectorKey, timestamp, nonce, body);
  if (!timingSafeHexEqual(signature, expectedSignature)) {
    throw new UnauthorizedError('Invalid application connector signature');
  }

  try {
    await transaction(async (client) => {
      await client.query('DELETE FROM application_connector_nonces WHERE expires_at < NOW()');
      await client.query(
        `INSERT INTO application_connector_nonces (application_id,nonce,expires_at)
         VALUES ($1,$2,NOW() + ($3 * INTERVAL '1 second'))`,
        [applicationId, nonce, config.maxClockSkewSeconds]
      );
      await client.query('UPDATE application_connectors SET last_seen_at=NOW(),updated_at=NOW() WHERE id=$1', [row.id]);
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'Application connector request was already used', 'APPLICATION_REPLAY_DETECTED');
    }
    throw error;
  }

  return {
    applicationId: String(row.application_id),
    connectorId: String(row.id),
    name: String(row.name),
    baseUrl: String(row.base_url),
  };
}

function safeTargetPath(value?: string): string {
  const path = String(value || '/dashboard').trim();
  return path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

export async function issueSsoCode(application: TrustedApplication, payload: SsoIssuePayload): Promise<{ redirect_url: string; expires_in_seconds: number }> {
  if (!payload.external_user_id || !payload.email || !payload.display_name) {
    throw new AppError(400, 'external_user_id, email and display_name are required', 'SSO_PAYLOAD_INVALID');
  }
  if (!['admin', 'superadmin'].includes(payload.external_role)) {
    throw new AppError(403, 'Only EquiProfile administrators may use Marketing SSO', 'SSO_ROLE_FORBIDDEN');
  }
  const email = payload.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AppError(400, 'A valid email is required', 'SSO_EMAIL_INVALID');

  const config = connectorConfig();
  const code = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO application_sso_codes
       (application_id,code_hash,external_user_id,email,display_name,external_role,target_path,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + ($8 * INTERVAL '1 second'))`,
    [
      application.applicationId,
      hashOpaqueValue(code),
      String(payload.external_user_id),
      email,
      String(payload.display_name).trim(),
      payload.external_role,
      safeTargetPath(payload.target_path),
      config.ssoCodeTtlSeconds,
    ]
  );

  return {
    redirect_url: `${env.APP_URL.replace(/\/$/, '')}/connector/sso?code=${encodeURIComponent(code)}`,
    expires_in_seconds: config.ssoCodeTtlSeconds,
  };
}

function applicationSlug(applicationId: string): string {
  const slug = applicationId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'connected-application';
}

export async function redeemSsoCode(code: string): Promise<{
  user: Record<string, unknown>;
  organization: Record<string, unknown>;
  accessToken: string;
  refreshToken: string;
  target_path: string;
  mfa_enrollment_required: boolean;
}> {
  if (!code || code.length < 32) throw new UnauthorizedError('Invalid SSO code');
  const codeHash = hashOpaqueValue(code);

  return transaction(async (client) => {
    const codeResult = await client.query(
      `SELECT s.*,c.id AS connector_id,c.name AS application_name,c.default_organization_id
       FROM application_sso_codes s
       JOIN application_connectors c ON c.application_id=s.application_id
       WHERE s.code_hash=$1 AND c.active=TRUE
       FOR UPDATE OF s,c`,
      [codeHash]
    );
    if (codeResult.rows.length === 0) throw new UnauthorizedError('Invalid SSO code');
    const sso = codeResult.rows[0];
    if (sso.used_at || new Date(sso.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedError('SSO code has expired or was already used');
    }
    await client.query('UPDATE application_sso_codes SET used_at=NOW() WHERE id=$1', [sso.id]);

    const email = String(sso.email).toLowerCase();
    let userResult = await client.query(
      'SELECT id,email,name,avatar,role,email_verified,status,created_at,two_factor_enabled FROM users WHERE LOWER(email)=$1 AND deleted_at IS NULL FOR UPDATE',
      [email]
    );
    if (userResult.rows.length === 0) {
      const passwordHash = await hashPassword(crypto.randomBytes(48).toString('base64url'));
      userResult = await client.query(
        `INSERT INTO users (email,password_hash,name,role,email_verified,status)
         VALUES ($1,$2,$3,'admin',TRUE,'active')
         RETURNING id,email,name,avatar,role,email_verified,status,created_at,two_factor_enabled`,
        [email, passwordHash, String(sso.display_name)]
      );
    } else {
      userResult = await client.query(
        `UPDATE users SET name=$2,email_verified=TRUE,status='active',
           role=CASE WHEN role='superadmin' THEN role ELSE 'admin' END,
           updated_at=NOW()
         WHERE id=$1
         RETURNING id,email,name,avatar,role,email_verified,status,created_at,two_factor_enabled`,
        [userResult.rows[0].id, String(sso.display_name)]
      );
    }
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO application_identity_links
         (application_id,external_user_id,user_id,external_email,external_role)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (application_id,external_user_id) DO UPDATE SET
         user_id=EXCLUDED.user_id,
         external_email=EXCLUDED.external_email,
         external_role=EXCLUDED.external_role,
         updated_at=NOW()`,
      [sso.application_id, sso.external_user_id, user.id, email, sso.external_role]
    );

    let organizationResult;
    if (sso.default_organization_id) {
      organizationResult = await client.query('SELECT * FROM organizations WHERE id=$1 AND deleted_at IS NULL', [sso.default_organization_id]);
    } else {
      organizationResult = await client.query('SELECT * FROM organizations WHERE slug=$1 AND deleted_at IS NULL LIMIT 1', [applicationSlug(String(sso.application_id))]);
      if (organizationResult.rows.length === 0) {
        organizationResult = await client.query(
          `INSERT INTO organizations (name,slug) VALUES ($1,$2) RETURNING *`,
          [String(sso.application_name), applicationSlug(String(sso.application_id))]
        );
      }
      await client.query('UPDATE application_connectors SET default_organization_id=$2,updated_at=NOW() WHERE id=$1', [sso.connector_id, organizationResult.rows[0].id]);
    }
    if (organizationResult.rows.length === 0) throw new AppError(500, 'Connected Marketing workspace is unavailable', 'CONNECTOR_ORGANIZATION_MISSING');
    const organization = organizationResult.rows[0];

    const ownerCount = await client.query(
      "SELECT COUNT(*)::int AS count FROM organization_members WHERE organization_id=$1 AND role='owner'",
      [organization.id]
    );
    if (Number(ownerCount.rows[0]?.count || 0) > 0) {
      const existingOwner = await client.query("SELECT user_id FROM organization_members WHERE organization_id=$1 AND role='owner'", [organization.id]);
      if (String(existingOwner.rows[0]?.user_id) !== String(user.id)) throw new AppError(409, 'This application already has a Marketing owner', 'OWNER_ALREADY_PROVISIONED');
    }
    const membershipRole = 'owner';
    await client.query(
      `INSERT INTO organization_members (organization_id,user_id,role,invited_by)
       VALUES ($1,$2,$3,$2)
       ON CONFLICT (organization_id,user_id) DO UPDATE SET
         role=CASE WHEN organization_members.role='owner' THEN 'owner' ELSE EXCLUDED.role END`,
      [organization.id, user.id, membershipRole]
    );

    const mfaComplete = user.two_factor_enabled === true;
    const accessToken = generateAccessToken(user.id, user.email, user.role, mfaComplete);
    const refreshToken = mfaComplete ? generateRefreshToken(user.id) : '';
    if (refreshToken) await client.query(
      `INSERT INTO refresh_tokens (user_id,token_hash,expires_at)
       VALUES ($1,$2,NOW() + INTERVAL '7 days')`,
      [user.id, hashOpaqueValue(refreshToken)]
    );
    await client.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);

    return {
      user,
      organization,
      accessToken,
      refreshToken,
      mfa_enrollment_required: !mfaComplete,
      target_path: safeTargetPath(String(sso.target_path)),
    };
  });
}

export async function recordConversionEvent(application: TrustedApplication, payload: ConversionEventPayload): Promise<{ accepted: boolean; duplicate: boolean }> {
  if (!payload.event_id || !payload.event_type || !payload.occurred_at || !payload.consent_basis) {
    throw new AppError(400, 'event_id, event_type, occurred_at and consent_basis are required', 'CONVERSION_EVENT_INVALID');
  }
  const occurredAt = new Date(payload.occurred_at);
  if (Number.isNaN(occurredAt.getTime())) throw new AppError(400, 'occurred_at must be an ISO date', 'CONVERSION_EVENT_INVALID');
  if ((payload.currency || 'GBP') !== 'GBP') throw new AppError(400, 'Conversion value currency must be GBP', 'CONVERSION_CURRENCY_INVALID');
  if (payload.value_pence !== undefined && (!Number.isInteger(payload.value_pence) || payload.value_pence < 0)) {
    throw new AppError(400, 'value_pence must be a non-negative integer', 'CONVERSION_VALUE_INVALID');
  }

  const result = await query(
    `INSERT INTO application_conversion_events
       (application_id,event_id,event_type,occurred_at,external_user_id,
        external_organization_id,value_pence,currency,consent_basis,properties)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'GBP',$8,$9)
     ON CONFLICT (application_id,event_id) DO NOTHING
     RETURNING id`,
    [
      application.applicationId,
      String(payload.event_id),
      String(payload.event_type),
      occurredAt,
      payload.external_user_id || null,
      payload.external_organization_id || null,
      payload.value_pence ?? null,
      payload.consent_basis,
      JSON.stringify(payload.properties || {}),
    ]
  );
  return { accepted: true, duplicate: result.rows.length === 0 };
}
