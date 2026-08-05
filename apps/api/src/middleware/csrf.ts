import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const allowedOrigins = [env.APP_URL, env.API_URL]
  .filter(Boolean)
  .map((value) => {
    try { return new URL(value).origin; }
    catch { return value; }
  });

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

  try {
    const originBase = new URL(origin).origin;
    if (allowedOrigins.includes(originBase)) return next();
  } catch {
    // Invalid URL is rejected below.
  }

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
