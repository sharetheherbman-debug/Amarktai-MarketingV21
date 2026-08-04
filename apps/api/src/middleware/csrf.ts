import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const allowedOrigins = [env.APP_URL, env.API_URL].filter(Boolean);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for the auth login/register endpoints (no cookie yet)
  const path = req.path;
  if (path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/auth/forgot-password')) {
    return next();
  }

  // Check Origin header
  const origin = req.headers.origin || req.headers.referer;

  if (!origin) {
    // Allow requests without Origin (e.g., server-to-server, mobile apps)
    // but only if there's no cookie (indicating not a browser session)
    if (!req.cookies?.refresh_token) {
      return next();
    }

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

  // Validate origin against allowed origins
  try {
    const originUrl = new URL(origin);
    const originBase = `${originUrl.protocol}//${originUrl.host}`;

    if (allowedOrigins.includes(originBase)) {
      return next();
    }

    // Also check if origin matches the APP_URL without port
    const appUrlObj = new URL(env.APP_URL);
    if (originUrl.hostname === appUrlObj.hostname) {
      return next();
    }
  } catch {
    // Invalid origin URL
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
