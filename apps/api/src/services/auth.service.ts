import { query } from '../config/database';
import redis from '../config/redis';
import { hashPassword, comparePassword, generateVerificationToken, generateResetToken } from '../utils/encryption';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError, ConflictError, UnauthorizedError, NotFoundError } from '../middleware/errorHandler';
import { User, RegisterData, LoginData, TokenPair } from '../types';
import { logger } from '../utils/logger';
import { verify as verifyMfa } from './mfa.service';
import crypto from 'crypto';

export async function register(data: RegisterData): Promise<{ user: Omit<User, 'password_hash'>; tokens: TokenPair }> {
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existingUser.rows.length > 0) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(data.password);
  const verificationToken = generateVerificationToken();

  const result = await query(
    `INSERT INTO users (email, password_hash, name, email_verification_token)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, avatar, role, email_verified, status, created_at`,
    [data.email, passwordHash, data.name, verificationToken]
  );

  const user = result.rows[0];
  const tokens = generateTokenPair(user.id, user.email, user.role);

  await storeRefreshToken(user.id, tokens.refreshToken);

  logger.info(`User registered: ${data.email}`);
  return { user, tokens };
}

export async function login(email: string, password: string, mfaCode?: string): Promise<{ user: Omit<User, 'password_hash'>; tokens: TokenPair; mfaEnrollmentRequired?: boolean }> {
  const result = await query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const isValidPassword = await comparePassword(password, user.password_hash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.two_factor_enabled) {
    if (!mfaCode) throw new AppError(401, 'Authenticator or recovery code required', 'MFA_REQUIRED');
    await verifyMfa(user.id, mfaCode);
  } else {
    const { password_hash, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      tokens: { accessToken: generateAccessToken(user.id, user.email, user.role, false), refreshToken: '' },
      mfaEnrollmentRequired: true,
    };
  }

  const tokens = generateTokenPair(user.id, user.email, user.role);
  await storeRefreshToken(user.id, tokens.refreshToken);

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  logger.info(`User logged in: ${email}`);

  const { password_hash, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, tokens };
}

export async function refreshToken(token: string): Promise<TokenPair> {
  try {
    const decoded = verifyRefreshToken(token);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const storedToken = await query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND revoked = false AND expires_at > NOW()',
      [decoded.userId, tokenHash]
    );

    if (storedToken.rows.length === 0) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const userResult = await query(
      'SELECT id, email, role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    const user = userResult.rows[0];
    const newTokens = generateTokenPair(user.id, user.email, user.role);

    await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [storedToken.rows[0].id]);
    await storeRefreshToken(user.id, newTokens.refreshToken);

    return newTokens;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new UnauthorizedError('Invalid refresh token');
  }
}

export async function forgotPassword(email: string): Promise<void> {
  const result = await query(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  if (result.rows.length === 0) {
    return;
  }

  const userId = result.rows[0].id;
  const resetToken = generateResetToken();
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  await query(
    'UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL \'1 hour\' WHERE id = $2',
    [tokenHash, userId]
  );

  await redis.setex(`reset:${tokenHash}`, 3600, userId);

  logger.info(`Password reset requested for: ${email}`);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await query(
    'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND deleted_at IS NULL',
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
  }

  const userId = result.rows[0].id;
  const passwordHash = await hashPassword(newPassword);

  await query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [passwordHash, userId]
  );

  await redis.del(`reset:${tokenHash}`);

  await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [userId]);

  logger.info(`Password reset completed for user: ${userId}`);
}

export async function verifyEmail(token: string): Promise<void> {
  const result = await query(
    'SELECT id FROM users WHERE email_verification_token = $1 AND deleted_at IS NULL',
    [token]
  );

  if (result.rows.length === 0) {
    throw new AppError(400, 'Invalid verification token', 'INVALID_TOKEN');
  }

  await query(
    'UPDATE users SET email_verified = true, email_verification_token = NULL WHERE id = $1',
    [result.rows[0].id]
  );

  logger.info(`Email verified for user: ${result.rows[0].id}`);
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('User');
  }

  const isValid = await comparePassword(oldPassword, result.rows[0].password_hash);
  if (!isValid) {
    throw new UnauthorizedError('Invalid old password');
  }

  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

  await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [userId]);

  logger.info(`Password changed for user: ${userId}`);
}

export async function resendVerification(email: string): Promise<void> {
  const result = await query(
    'SELECT id, email_verified FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  if (result.rows.length === 0) {
    return;
  }

  if (result.rows[0].email_verified) {
    return;
  }

  const verificationToken = generateVerificationToken();
  await query(
    'UPDATE users SET email_verification_token = $1 WHERE id = $2',
    [verificationToken, result.rows[0].id]
  );

  logger.info(`Verification email resent to: ${email}`);
}

function generateTokenPair(userId: string, email: string, role: string): TokenPair {
  return {
    accessToken: generateAccessToken(userId, email, role),
    refreshToken: generateRefreshToken(userId),
  };
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
}

export async function issueSessionAfterMfaEnrollment(userId: string) {
  const result = await query('SELECT * FROM users WHERE id=$1 AND status=\'active\' AND two_factor_enabled=TRUE AND deleted_at IS NULL', [userId]);
  if (!result.rows[0]) throw new UnauthorizedError('MFA enrollment is incomplete');
  const user = result.rows[0];
  const tokens = generateTokenPair(user.id, user.email, user.role);
  await storeRefreshToken(user.id, tokens.refreshToken);
  const { password_hash, two_factor_secret, two_factor_recovery_codes, ...safeUser } = user;
  return { user: safeUser, tokens };
}
