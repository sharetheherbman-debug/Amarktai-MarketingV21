import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { updateProfileSchema, changePasswordSchema } from '../utils/validation';
import { query } from '../config/database';
import { hashPassword, comparePassword } from '../utils/encryption';
import { NotFoundError, UnauthorizedError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();

router.use(requireAuth);

router.get('/profile', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'SELECT id, email, name, avatar, role, email_verified, settings, status, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', validateBody(updateProfileSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (req.body.name) {
      updates.push(`name = $${paramCount++}`);
      values.push(req.body.name);
    }
    if (req.body.avatar) {
      updates.push(`avatar = $${paramCount++}`);
      values.push(req.body.avatar);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.user!.userId);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, email, name, avatar, role, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/password', validateBody(changePasswordSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.userId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const isValid = await comparePassword(req.body.oldPassword, result.rows[0].password_hash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid old password');
    }

    const passwordHash = await hashPassword(req.body.newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.user!.userId]);

    res.json({ success: true, data: { message: 'Password updated' } });
  } catch (error) {
    next(error);
  }
});

router.delete('/account', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await query('UPDATE users SET deleted_at = NOW(), status = $1 WHERE id = $2', ['inactive', req.user!.userId]);
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.json({ success: true, data: { message: 'Account deleted' } });
  } catch (error) {
    next(error);
  }
});

export default router;
