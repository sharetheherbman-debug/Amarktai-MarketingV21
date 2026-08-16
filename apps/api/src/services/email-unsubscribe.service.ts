import crypto from 'crypto';
import { env } from '../config/env';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface UnsubscribeClaim {
  organizationId: string;
  emailHash: string;
  expiresAt: number;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', env.ENCRYPTION_KEY).update(payload).digest('base64url');
}

export function createUnsubscribeUrl(organizationId: string, email: string): string {
  const claim: UnsubscribeClaim = {
    organizationId,
    emailHash: crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex'),
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  return `${env.API_URL.replace(/\/$/, '')}/v1/email/unsubscribe?token=${encodeURIComponent(`${payload}.${sign(payload)}`)}`;
}

export async function unsubscribeRecipient(token: string): Promise<void> {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) throw new AppError(400, 'Invalid unsubscribe token', 'UNSUBSCRIBE_TOKEN_INVALID');
  const expected = sign(payload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new AppError(400, 'Invalid unsubscribe token', 'UNSUBSCRIBE_TOKEN_INVALID');
  }
  let claim: UnsubscribeClaim;
  try { claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UnsubscribeClaim; }
  catch { throw new AppError(400, 'Invalid unsubscribe token', 'UNSUBSCRIBE_TOKEN_INVALID'); }
  if (!claim.organizationId || !/^[a-f0-9]{64}$/.test(claim.emailHash) || !Number.isFinite(claim.expiresAt) || claim.expiresAt < Date.now()) {
    throw new AppError(400, 'Expired or invalid unsubscribe token', 'UNSUBSCRIBE_TOKEN_INVALID');
  }
  await query(
    `INSERT INTO email_suppressions (organization_id,email_hash,reason,source,active)
     VALUES ($1,$2,'unsubscribe','signed_one_click',TRUE)
     ON CONFLICT (organization_id,email_hash)
     DO UPDATE SET reason='unsubscribe',source='signed_one_click',active=TRUE`,
    [claim.organizationId, claim.emailHash]
  );
  await query(
    `UPDATE crm_contacts SET marketing_consent_status='withdrawn',marketing_consent_at=NOW(),updated_at=NOW()
     WHERE organization_id=$1 AND encode(digest(LOWER(TRIM(email)),'sha256'),'hex')=$2`,
    [claim.organizationId, claim.emailHash]
  );
}
