import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';

function toOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/$/, '');
  }
}

const allowedOrigins = new Set(
  [env.APP_URL, env.API_URL, ...env.CORS_ORIGIN.split(',')]
    .map((value) => value.trim())
    .filter(Boolean)
    .map(toOrigin)
);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const requestPath = req.path;
  if (
    requestPath.includes('/auth/login') ||
    requestPath.includes('/auth/register') ||
    requestPath.includes('/auth/forgot-password') ||
    requestPath.includes('/studio/webhooks/genx')
  ) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const hasBrowserSession = Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);

  if (!origin) {
    if (!hasBrowserSession) return next();

    logger.warn('CSRF: Missing Origin/Referer header with active session', {
      path: req.path,
      ip: req.ip,
    });
    res.status(403).json({
      success: false,
      error: { message: 'Missing origin header', code: 'CSRF_VALIDATION_FAILED' },
    });
    return;
  }

  if (allowedOrigins.has(toOrigin(origin))) return next();

  logger.warn('CSRF: Invalid origin', {
    origin,
    path: req.path,
    ip: req.ip,
  });
  res.status(403).json({
    success: false,
    error: { message: 'Invalid origin', code: 'CSRF_VALIDATION_FAILED' },
  });
}
