import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { ExtendedRequest, UserRole, MemberRole } from '../types';

export interface AuthRequest extends ExtendedRequest {}

function accessTokenFromRequest(req: AuthRequest): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  if (req.cookies?.accessToken) return String(req.cookies.accessToken);
  return undefined;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const token = accessTokenFromRequest(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
      return;
    }

    const payload = verifyAccessToken(token);
    if (payload.mfa !== true) {
      res.status(403).json({ success: false, error: { message: 'Marketing MFA verification required', code: 'MFA_REQUIRED' } });
      return;
    }
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      mfa: true,
    };
    next();
  } catch (error) {
    logger.warn('Auth middleware error', error);
    res.status(401).json({
      success: false,
      error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
    });
  }
}

export function requireMfaEnrollment(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const token = accessTokenFromRequest(req);
    if (!token) throw new Error('missing');
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.userId, email: payload.email, role: payload.role, mfa: payload.mfa };
    next();
  } catch {
    res.status(401).json({ success: false, error: { message: 'MFA enrollment session required', code: 'UNAUTHORIZED' } });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { message: 'Insufficient permissions', code: 'FORBIDDEN' },
      });
      return;
    }

    next();
  };
}

export function requireOrgAccess(...roles: MemberRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
        });
        return;
      }

      const orgId = req.params.id || req.params.orgId || req.body.organization_id;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: { message: 'Organization ID required', code: 'BAD_REQUEST' },
        });
        return;
      }

      const result = await query(
        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [orgId, req.user.userId]
      );

      if (result.rows.length === 0) {
        res.status(403).json({
          success: false,
          error: { message: 'Not a member of this organization', code: 'FORBIDDEN' },
        });
        return;
      }

      const memberRole = result.rows[0].role as MemberRole;
      if (roles.length > 0 && !roles.includes(memberRole)) {
        res.status(403).json({
          success: false,
          error: { message: 'Insufficient organization permissions', code: 'FORBIDDEN' },
        });
        return;
      }

      req.organizationId = orgId;
      next();
    } catch (error) {
      logger.error('Org access middleware error', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
      });
    }
  };
}
