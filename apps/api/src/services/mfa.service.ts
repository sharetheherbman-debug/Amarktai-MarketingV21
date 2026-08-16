import crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { query, transaction } from '../config/database';
import { decrypt, encrypt } from '../utils/encryption';
import { env } from '../config/env';
import { AppError, UnauthorizedError } from '../middleware/errorHandler';

const issuer = 'EquiProfile Marketing';
const recoveryHash = (code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(code.replace(/\s/g, '').toUpperCase()).digest('hex');
const newRecoveryCodes = () => Array.from({ length: 10 }, () => `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase());

function totp(secret: string, email: string) {
  return new OTPAuth.TOTP({ issuer, label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}

export async function beginEnrollment(userId: string) {
  const result = await query('SELECT email,two_factor_enabled FROM users WHERE id=$1 AND status=\'active\' AND deleted_at IS NULL', [userId]);
  if (!result.rows[0]) throw new UnauthorizedError('Account is unavailable');
  if (result.rows[0].two_factor_enabled) throw new AppError(409, 'Two-factor authentication is already enabled', 'MFA_ALREADY_ENABLED');
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const uri = totp(secret, result.rows[0].email).toString();
  await query('UPDATE users SET two_factor_secret=$2,two_factor_updated_at=NOW() WHERE id=$1', [userId, JSON.stringify(encrypt(secret))]);
  return { provisioning_uri: uri, qr_data_url: await QRCode.toDataURL(uri), manual_key: secret };
}

export async function completeEnrollment(userId: string, code: string) {
  const result = await query('SELECT email,two_factor_secret,two_factor_enabled FROM users WHERE id=$1 FOR UPDATE', [userId]);
  const user = result.rows[0];
  if (!user?.two_factor_secret || user.two_factor_enabled) throw new AppError(409, 'MFA enrollment is not pending', 'MFA_NOT_PENDING');
  const secret = decrypt(JSON.parse(user.two_factor_secret));
  if (totp(secret, user.email).validate({ token: code, window: 1 }) === null) throw new UnauthorizedError('Invalid authenticator code');
  const recoveryCodes = newRecoveryCodes();
  await query(`UPDATE users SET two_factor_enabled=TRUE,two_factor_recovery_codes=$2,two_factor_enrolled_at=NOW(),two_factor_updated_at=NOW() WHERE id=$1`, [userId, JSON.stringify(recoveryCodes.map(recoveryHash))]);
  await query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_value) VALUES ($1,'mfa.enrolled','user',$1,$2)`, [userId, JSON.stringify({ method: 'totp' })]);
  return { recovery_codes: recoveryCodes };
}

export async function verify(userId: string, code: string): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query('SELECT email,two_factor_secret,two_factor_enabled,two_factor_recovery_codes,two_factor_last_counter FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const user = result.rows[0];
    if (!user?.two_factor_enabled || !user.two_factor_secret) throw new UnauthorizedError('MFA enrollment is required');
    const normalized = code.replace(/\s/g, '').toUpperCase();
    if (/^\d{6}$/.test(normalized)) {
      const secret = decrypt(JSON.parse(user.two_factor_secret));
      const delta = totp(secret, user.email).validate({ token: normalized, window: 1 });
      if (delta === null) throw new UnauthorizedError('Invalid authenticator code');
      const counter = Math.floor(Date.now() / 30000) + delta;
      if (user.two_factor_last_counter != null && counter <= Number(user.two_factor_last_counter)) throw new UnauthorizedError('Authenticator code was already used');
      await client.query('UPDATE users SET two_factor_last_counter=$2 WHERE id=$1', [userId, counter]);
    } else {
      const hashes: string[] = Array.isArray(user.two_factor_recovery_codes) ? user.two_factor_recovery_codes : JSON.parse(user.two_factor_recovery_codes || '[]');
      const hash = recoveryHash(normalized);
      const index = hashes.findIndex((value) => crypto.timingSafeEqual(Buffer.from(value), Buffer.from(hash)));
      if (index < 0) throw new UnauthorizedError('Invalid recovery code');
      hashes.splice(index, 1);
      await client.query('UPDATE users SET two_factor_recovery_codes=$2 WHERE id=$1', [userId, JSON.stringify(hashes)]);
    }
    await client.query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id) VALUES ($1,'mfa.verified','user',$1)`, [userId]);
  });
}

export async function regenerateRecoveryCodes(userId: string, code: string) {
  await verify(userId, code);
  const recoveryCodes = newRecoveryCodes();
  await query('UPDATE users SET two_factor_recovery_codes=$2,two_factor_updated_at=NOW() WHERE id=$1', [userId, JSON.stringify(recoveryCodes.map(recoveryHash))]);
  await query(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id) VALUES ($1,'mfa.recovery_codes_regenerated','user',$1)`, [userId]);
  return { recovery_codes: recoveryCodes };
}
