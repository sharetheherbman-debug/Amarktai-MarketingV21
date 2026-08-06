import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { query } from '../config/database';
import { ApiResponse } from '../types';

export type AgencyRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

async function resolveAgencyId(req: AuthRequest): Promise<string> {
  const direct = String(
    req.body?.agency_id || req.query.agency_id || req.params.agencyId || ''
  ).trim();
  if (direct) return direct;

  if (req.params.portalId) {
    const result = await query('SELECT agency_id FROM client_portals WHERE id=$1', [req.params.portalId]);
    return result.rows[0]?.agency_id ? String(result.rows[0].agency_id) : '';
  }
  if (req.params.reportId) {
    const result = await query('SELECT agency_id FROM client_reports WHERE id=$1', [req.params.reportId]);
    return result.rows[0]?.agency_id ? String(result.rows[0].agency_id) : '';
  }
  return '';
}

async function getAgencyAccess(agencyId: string, userId: string): Promise<{ allowed: boolean; role: AgencyRole | null; organizationId: string | null }> {
  const result = await query(
    `SELECT a.organization_id,
            COALESCE(atm.role,
              CASE WHEN om.role IN ('owner','admin') THEN om.role ELSE 'member' END
            ) AS effective_role
     FROM agencies a
     LEFT JOIN organization_members om
       ON om.organization_id=a.organization_id AND om.user_id=$2
     LEFT JOIN agency_team_members atm
       ON atm.agency_id=a.id AND atm.user_id=$2 AND atm.status='active'
     WHERE a.id=$1
       AND a.status <> 'deleted'
       AND (om.user_id IS NOT NULL OR atm.user_id IS NOT NULL)
     LIMIT 1`,
    [agencyId, userId]
  );
  if (result.rows.length === 0) return { allowed: false, role: null, organizationId: null };
  return {
    allowed: true,
    role: String(result.rows[0].effective_role || 'member') as AgencyRole,
    organizationId: String(result.rows[0].organization_id),
  };
}

export function requireAgencyAccess(...roles: AgencyRole[]) {
  return async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
        return;
      }
      const agencyId = await resolveAgencyId(req);
      if (!agencyId) {
        res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
        return;
      }
      const access = await getAgencyAccess(agencyId, req.user.userId);
      if (!access.allowed || (roles.length > 0 && (!access.role || !roles.includes(access.role)))) {
        res.status(403).json({ success: false, error: { message: 'Insufficient agency permissions', code: 'FORBIDDEN' } });
        return;
      }
      req.body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!req.body.agency_id) req.body.agency_id = agencyId;
      if (!req.query.agency_id) req.query.agency_id = agencyId;
      (req as AuthRequest & { agencyId?: string }).agencyId = agencyId;
      if (!req.organizationId && access.organizationId) req.organizationId = access.organizationId;
      next();
    } catch (error) {
      next(error);
    }
  };
}
