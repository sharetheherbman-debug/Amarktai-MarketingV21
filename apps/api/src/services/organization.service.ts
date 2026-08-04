import { query, transaction } from '../config/database';
import { AppError, NotFoundError, ForbiddenError, ConflictError } from '../middleware/errorHandler';
import { Organization, OrganizationMember, CreateOrganizationData, MemberRole } from '../types';
import { logger } from '../utils/logger';

export async function create(userId: string, data: CreateOrganizationData): Promise<Organization> {
  const existing = await query('SELECT id FROM organizations WHERE slug = $1 AND deleted_at IS NULL', [data.slug]);
  if (existing.rows.length > 0) {
    throw new ConflictError('Organization slug already exists');
  }

  return transaction(async (client) => {
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       RETURNING *`,
      [data.name, data.slug]
    );

    const org = orgResult.rows[0];

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
       VALUES ($1, $2, 'owner', $2)`,
      [org.id, userId]
    );

    logger.info(`Organization created: ${org.slug} by user ${userId}`);
    return org;
  });
}

export async function list(userId: string): Promise<Organization[]> {
  const result = await query(
    `SELECT o.*, om.role as member_role
     FROM organizations o
     INNER JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = $1 AND o.deleted_at IS NULL
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getById(orgId: string, userId: string): Promise<Organization> {
  const result = await query(
    `SELECT o.*, om.role as member_role
     FROM organizations o
     INNER JOIN organization_members om ON o.id = om.organization_id
     WHERE o.id = $1 AND om.user_id = $2 AND o.deleted_at IS NULL`,
    [orgId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Organization');
  }

  return result.rows[0];
}

export async function update(orgId: string, userId: string, data: Partial<CreateOrganizationData>): Promise<Organization> {
  const memberCheck = await query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );

  if (memberCheck.rows.length === 0) {
    throw new NotFoundError('Organization');
  }

  const role = memberCheck.rows[0].role;
  if (role !== 'owner' && role !== 'admin') {
    throw new ForbiddenError('Only owners and admins can update organization');
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.slug) {
    const existing = await query(
      'SELECT id FROM organizations WHERE slug = $1 AND id != $2 AND deleted_at IS NULL',
      [data.slug, orgId]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('Organization slug already exists');
    }
    updates.push(`slug = $${paramCount++}`);
    values.push(data.slug);
  }

  updates.push(`updated_at = NOW()`);
  values.push(orgId);

  const result = await query(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Organization');
  }

  logger.info(`Organization updated: ${orgId}`);
  return result.rows[0];
}

export async function remove(orgId: string, userId: string): Promise<void> {
  const memberCheck = await query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );

  if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'owner') {
    throw new ForbiddenError('Only owners can delete organization');
  }

  await query('UPDATE organizations SET deleted_at = NOW() WHERE id = $1', [orgId]);
  logger.info(`Organization soft-deleted: ${orgId}`);
}

export async function addMember(orgId: string, inviterId: string, email: string, role: MemberRole): Promise<OrganizationMember> {
  const inviterCheck = await query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, inviterId]
  );

  if (inviterCheck.rows.length === 0 || !['owner', 'admin'].includes(inviterCheck.rows[0].role)) {
    throw new ForbiddenError('Only owners and admins can add members');
  }

  const userResult = await query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (userResult.rows.length === 0) {
    throw new NotFoundError('User with this email');
  }

  const userId = userResult.rows[0].id;

  const existingMember = await query(
    'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  if (existingMember.rows.length > 0) {
    throw new ConflictError('User is already a member');
  }

  const result = await query(
    `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [orgId, userId, role, inviterId]
  );

  logger.info(`Member added to org ${orgId}: ${email} as ${role}`);
  return result.rows[0];
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const memberCheck = await query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );

  if (memberCheck.rows.length === 0) {
    throw new NotFoundError('Member');
  }

  if (memberCheck.rows[0].role === 'owner') {
    throw new ForbiddenError('Cannot remove the owner');
  }

  await query(
    'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );

  logger.info(`Member removed from org ${orgId}: ${userId}`);
}

export async function updateMemberRole(orgId: string, adminId: string, userId: string, role: MemberRole): Promise<OrganizationMember> {
  const adminCheck = await query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, adminId]
  );

  if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'owner') {
    throw new ForbiddenError('Only owners can update member roles');
  }

  const memberCheck = await query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );

  if (memberCheck.rows.length === 0) {
    throw new NotFoundError('Member');
  }

  if (memberCheck.rows[0].role === 'owner') {
    throw new ForbiddenError('Cannot change owner role');
  }

  const result = await query(
    `UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3 RETURNING *`,
    [role, orgId, userId]
  );

  logger.info(`Member role updated in org ${orgId}: ${userId} to ${role}`);
  return result.rows[0];
}
