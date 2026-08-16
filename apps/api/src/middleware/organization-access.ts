import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { query } from '../config/database';
import { ApiResponse } from '../types';

export function getRequestedOrganizationId(req: AuthRequest): string {
  const candidates = [
    req.body?.organization_id,
    req.query.organization_id,
    req.params.organizationId,
    req.params.orgId,
    req.header('x-organization-id'),
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const unique = [...new Set(candidates)];
  if (unique.length > 1) return '';
  return unique[0] || '';
}

async function hasMembership(organizationId: string, userId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2',
    [organizationId, userId]
  );
  return result.rows.length > 0;
}

export async function requireOrganizationMembership(
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const orgId = getRequestedOrganizationId(req);
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    if (!await hasMembership(orgId, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }
    req.organizationId = orgId;
    next();
  } catch (error) { next(error); }
}

export function requireOrganizationRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
    try {
      const orgId = getRequestedOrganizationId(req);
      if (!orgId) {
        res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
        return;
      }
      const result = await query(
        'SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2',
        [orgId, req.user!.userId]
      );
      if (result.rows.length === 0 || !roles.includes(String(result.rows[0].role))) {
        res.status(403).json({ success: false, error: { message: 'Insufficient organization permissions', code: 'FORBIDDEN' } });
        return;
      }
      req.organizationId = orgId;
      next();
    } catch (error) { next(error); }
  };
}

export async function requireClientOrganizationMembership(
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const clientOrganizationId = String(req.body?.client_organization_id || '').trim();
    if (!clientOrganizationId) {
      res.status(400).json({ success: false, error: { message: 'client_organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    if (!await hasMembership(clientOrganizationId, req.user!.userId)) {
      res.status(403).json({
        success: false,
        error: { message: 'You must be a member of the client organization before assigning it to an agency', code: 'CLIENT_CONSENT_REQUIRED' },
      });
      return;
    }
    next();
  } catch (error) { next(error); }
}
