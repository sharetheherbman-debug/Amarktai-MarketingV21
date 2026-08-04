import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../types';

export interface TokenPayload extends AuthPayload {
  iat: number;
  exp: number;
}

export function generateAccessToken(userId: string, email: string, role: string): string {
  const payload: AuthPayload = { userId, email, role: role as any };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): { userId: string; iat: number; exp: number } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string; iat: number; exp: number };
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
