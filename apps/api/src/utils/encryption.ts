import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_ROUNDS = 12;

function getKey(): Buffer {
  const key = env.ENCRYPTION_KEY;
  return crypto.scryptSync(key, 'salt', 32);
}

export interface EncryptedData {
  iv: string;
  tag: string;
  encrypted: string;
}

export function encrypt(text: string): EncryptedData {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    encrypted,
  };
}

export function decrypt(data: EncryptedData): string {
  const key = getKey();
  const iv = Buffer.from(data.iv, 'hex');
  const tag = Buffer.from(data.tag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generateVerificationToken(): string {
  return generateToken(32);
}

export function generateResetToken(): string {
  return generateToken(32);
}
