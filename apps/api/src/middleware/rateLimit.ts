import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 20,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60000,
  max: (req: any) => {
    const user = req.user;
    if (!user) return 30;
    switch (user.role) {
      case 'superadmin':
        return 1000;
      case 'admin':
        return 500;
      default:
        return 100;
    }
  },
  message: {
    success: false,
    error: {
      message: 'API rate limit exceeded',
      code: 'API_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    return req.user?.userId || req.ip;
  },
});
