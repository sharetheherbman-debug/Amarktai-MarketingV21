import { Router, Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { authLimiter } from '../middleware/rateLimit';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../utils/validation';
import { env } from '../config/env';
import { ApiResponse } from '../types';

const router = Router();

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

router.post('/register', authLimiter, validateBody(registerSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { user, tokens } = await authService.register(req.body);

    res.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      data: { user, accessToken: tokens.accessToken },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const { user, tokens } = await authService.login(email, password);

    res.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: { user, accessToken: tokens.accessToken },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req: Request, res: Response<ApiResponse>) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

router.post('/refresh', async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken || req.body.refreshToken;

    if (!token) {
      res.status(400).json({
        success: false,
        error: { message: 'Refresh token required', code: 'MISSING_TOKEN' },
      });
      return;
    }

    const tokens = await authService.refreshToken(token);

    res.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await authService.forgotPassword(req.body.email);

    res.json({
      success: true,
      data: { message: 'If an account exists, a reset email has been sent' },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password);

    res.json({
      success: true,
      data: { message: 'Password reset successfully' },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-email', async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({
        success: false,
        error: { message: 'Verification token required', code: 'MISSING_TOKEN' },
      });
      return;
    }

    await authService.verifyEmail(token);

    res.json({
      success: true,
      data: { message: 'Email verified successfully' },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { query } = await import('../config/database');
    const result = await query(
      'SELECT id, email, name, avatar, role, email_verified, status, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/resend-verification', authLimiter, async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({
        success: false,
        error: { message: 'Email required', code: 'MISSING_EMAIL' },
      });
      return;
    }

    await authService.resendVerification(email);

    res.json({
      success: true,
      data: { message: 'If an account exists, a verification email has been sent' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
