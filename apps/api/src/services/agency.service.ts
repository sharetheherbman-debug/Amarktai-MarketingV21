import { query, transaction } from '../config/database';
import { AppError, NotFoundError, ForbiddenError, ConflictError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface Agency {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: Record<string, unknown>;
  settings: Record<string, unknown>;
  max_clients: number;
  max_team_members: number;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgencyTeamMember {
  id: string;
  agency_id: string;
  user_id: string;
  role: string;
  permissions: Record<string, unknown>;
  assigned_clients: string[];
  status: string;
  joined_at: Date;
}

export interface AgencyClientAssignment {
  id: string;
  agency_id: string;
  client_organization_id: string;
  assigned_to: string | null;
  relationship_type: string;
  contract_start: Date | null;
  contract_end: Date | null;
  monthly_fee_cents: number;
  notes: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAgencyData {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  max_clients?: number;
  max_team_members?: number;
}

export interface UpdateAgencyData {
  name?: string;
  description?: string;
  logo?: string;
  website?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  max_clients?: number;
  max_team_members?: number;
  status?: string;
}

export interface AddTeamMemberData {
  user_id: string;
  role: string;
  permissions?: Record<string, unknown>;
  assigned_clients?: string[];
}

export interface AssignClientData {
  client_organization_id: string;
  assigned_to?: string;
  relationship_type?: string;
  contract_start?: string;
  contract_end?: string;
  monthly_fee_cents?: number;
  notes?: string;
}

// Agency CRUD
export async function createAgency(userId: string, orgId: string, data: CreateAgencyData): Promise<Agency> {
  const existing = await query('SELECT id FROM agencies WHERE slug = $1', [data.slug]);
  if (existing.rows.length > 0) {
    throw new ConflictError('Agency slug already exists');
  }

  const orgCheck = await query(
    'SELECT id FROM agencies WHERE organization_id = $1',
    [orgId]
  );
  if (orgCheck.rows.length > 0) {
    throw new ConflictError('Organization already has an agency');
  }

  const result = await query(
    `INSERT INTO agencies (organization_id, name, slug, description, logo, website, contact_email, contact_phone, address, settings, max_clients, max_team_members, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      orgId, data.name, data.slug, data.description || null,
      data.logo || null, data.website || null, data.contact_email || null,
      data.contact_phone || null, JSON.stringify(data.address || {}),
      JSON.stringify(data.settings || {}), data.max_clients || 10,
      data.max_team_members || 50, userId
    ]
  );

  logger.info(`Agency created: ${data.slug} by user ${userId}`);
  return result.rows[0];
}

export async function getAgency(orgId: string): Promise<Agency> {
  const result = await query(
    'SELECT * FROM agencies WHERE organization_id = $1',
    [orgId]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Agency');
  }
  return result.rows[0];
}

export async function getAgencyById(agencyId: string): Promise<Agency> {
  const result = await query('SELECT * FROM agencies WHERE id = $1', [agencyId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Agency');
  }
  return result.rows[0];
}

export async function updateAgency(orgId: string, data: UpdateAgencyData): Promise<Agency> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name !== undefined) { updates.push(`name = $${paramCount++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${paramCount++}`); values.push(data.description); }
  if (data.logo !== undefined) { updates.push(`logo = $${paramCount++}`); values.push(data.logo); }
  if (data.website !== undefined) { updates.push(`website = $${paramCount++}`); values.push(data.website); }
  if (data.contact_email !== undefined) { updates.push(`contact_email = $${paramCount++}`); values.push(data.contact_email); }
  if (data.contact_phone !== undefined) { updates.push(`contact_phone = $${paramCount++}`); values.push(data.contact_phone); }
  if (data.address !== undefined) { updates.push(`address = $${paramCount++}`); values.push(JSON.stringify(data.address)); }
  if (data.settings !== undefined) { updates.push(`settings = $${paramCount++}`); values.push(JSON.stringify(data.settings)); }
  if (data.max_clients !== undefined) { updates.push(`max_clients = $${paramCount++}`); values.push(data.max_clients); }
  if (data.max_team_members !== undefined) { updates.push(`max_team_members = $${paramCount++}`); values.push(data.max_team_members); }
  if (data.status !== undefined) { updates.push(`status = $${paramCount++}`); values.push(data.status); }

  if (updates.length === 0) {
    return getAgency(orgId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(orgId);

  const result = await query(
    `UPDATE agencies SET ${updates.join(', ')} WHERE organization_id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Agency');
  }

  logger.info(`Agency updated: ${orgId}`);
  return result.rows[0];
}

// Team Management
export async function getTeamMembers(agencyId: string): Promise<AgencyTeamMember[]> {
  const result = await query(
    `SELECT atm.*, u.name as user_name, u.email as user_email
     FROM agency_team_members atm
     JOIN users u ON atm.user_id = u.id
     WHERE atm.agency_id = $1
     ORDER BY atm.joined_at DESC`,
    [agencyId]
  );
  return result.rows;
}

export async function addTeamMember(agencyId: string, data: AddTeamMemberData): Promise<AgencyTeamMember> {
  const agency = await getAgencyById(agencyId);

  const memberCount = await query(
    'SELECT COUNT(*) FROM agency_team_members WHERE agency_id = $1',
    [agencyId]
  );
  if (parseInt(memberCount.rows[0].count) >= agency.max_team_members) {
    throw new AppError(400, 'Maximum team members reached', 'MAX_MEMBERS');
  }

  const existing = await query(
    'SELECT id FROM agency_team_members WHERE agency_id = $1 AND user_id = $2',
    [agencyId, data.user_id]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('User is already a team member');
  }

  const result = await query(
    `INSERT INTO agency_team_members (agency_id, user_id, role, permissions, assigned_clients)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [agencyId, data.user_id, data.role, JSON.stringify(data.permissions || {}), JSON.stringify(data.assigned_clients || [])]
  );

  logger.info(`Team member added to agency ${agencyId}: ${data.user_id} as ${data.role}`);
  return result.rows[0];
}

export async function updateTeamMember(memberId: string, agencyId: string, data: Partial<AddTeamMemberData>): Promise<AgencyTeamMember> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.role !== undefined) { updates.push(`role = $${paramCount++}`); values.push(data.role); }
  if (data.permissions !== undefined) { updates.push(`permissions = $${paramCount++}`); values.push(JSON.stringify(data.permissions)); }
  if (data.assigned_clients !== undefined) { updates.push(`assigned_clients = $${paramCount++}`); values.push(JSON.stringify(data.assigned_clients)); }

  if (updates.length === 0) {
    const result = await query('SELECT * FROM agency_team_members WHERE id = $1 AND agency_id = $2', [memberId, agencyId]);
    if (result.rows.length === 0) throw new NotFoundError('Team member');
    return result.rows[0];
  }

  values.push(memberId, agencyId);
  const result = await query(
    `UPDATE agency_team_members SET ${updates.join(', ')} WHERE id = $${paramCount} AND agency_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Team member');
  logger.info(`Team member updated: ${memberId}`);
  return result.rows[0];
}

export async function removeTeamMember(memberId: string, agencyId: string): Promise<void> {
  const result = await query(
    'DELETE FROM agency_team_members WHERE id = $1 AND agency_id = $2',
    [memberId, agencyId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Team member');
  logger.info(`Team member removed: ${memberId}`);
}

// Client Assignments
export async function getClientAssignments(agencyId: string): Promise<AgencyClientAssignment[]> {
  const result = await query(
    `SELECT aca.*, o.name as client_name, o.slug as client_slug
     FROM agency_client_assignments aca
     JOIN organizations o ON aca.client_organization_id = o.id
     WHERE aca.agency_id = $1
     ORDER BY aca.created_at DESC`,
    [agencyId]
  );
  return result.rows;
}

export async function assignClient(agencyId: string, data: AssignClientData): Promise<AgencyClientAssignment> {
  const agency = await getAgencyById(agencyId);

  const clientCount = await query(
    "SELECT COUNT(*) FROM agency_client_assignments WHERE agency_id = $1 AND status = 'active'",
    [agencyId]
  );
  if (parseInt(clientCount.rows[0].count) >= agency.max_clients) {
    throw new AppError(400, 'Maximum clients reached', 'MAX_CLIENTS');
  }

  const existing = await query(
    'SELECT id FROM agency_client_assignments WHERE agency_id = $1 AND client_organization_id = $2',
    [agencyId, data.client_organization_id]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('Client is already assigned to this agency');
  }

  const result = await query(
    `INSERT INTO agency_client_assignments (agency_id, client_organization_id, assigned_to, relationship_type, contract_start, contract_end, monthly_fee_cents, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      agencyId, data.client_organization_id, data.assigned_to || null,
      data.relationship_type || 'managed', data.contract_start || null,
      data.contract_end || null, data.monthly_fee_cents || 0, data.notes || null
    ]
  );

  logger.info(`Client assigned to agency ${agencyId}: ${data.client_organization_id}`);
  return result.rows[0];
}

export async function updateClientAssignment(assignmentId: string, agencyId: string, data: Partial<AssignClientData>): Promise<AgencyClientAssignment> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.assigned_to !== undefined) { updates.push(`assigned_to = $${paramCount++}`); values.push(data.assigned_to); }
  if (data.relationship_type !== undefined) { updates.push(`relationship_type = $${paramCount++}`); values.push(data.relationship_type); }
  if (data.contract_start !== undefined) { updates.push(`contract_start = $${paramCount++}`); values.push(data.contract_start); }
  if (data.contract_end !== undefined) { updates.push(`contract_end = $${paramCount++}`); values.push(data.contract_end); }
  if (data.monthly_fee_cents !== undefined) { updates.push(`monthly_fee_cents = $${paramCount++}`); values.push(data.monthly_fee_cents); }
  if (data.notes !== undefined) { updates.push(`notes = $${paramCount++}`); values.push(data.notes); }

  if (updates.length === 0) {
    const result = await query('SELECT * FROM agency_client_assignments WHERE id = $1 AND agency_id = $2', [assignmentId, agencyId]);
    if (result.rows.length === 0) throw new NotFoundError('Client assignment');
    return result.rows[0];
  }

  updates.push(`updated_at = NOW()`);
  values.push(assignmentId, agencyId);

  const result = await query(
    `UPDATE agency_client_assignments SET ${updates.join(', ')} WHERE id = $${paramCount} AND agency_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Client assignment');
  logger.info(`Client assignment updated: ${assignmentId}`);
  return result.rows[0];
}

export async function removeClientAssignment(assignmentId: string, agencyId: string): Promise<void> {
  const result = await query(
    "UPDATE agency_client_assignments SET status = 'removed', updated_at = NOW() WHERE id = $1 AND agency_id = $2",
    [assignmentId, agencyId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Client assignment');
  logger.info(`Client assignment removed: ${assignmentId}`);
}

// Agency Dashboard Stats
export async function getAgencyStats(agencyId: string): Promise<Record<string, unknown>> {
  const [clientCount, teamCount, activeCampaigns, totalRevenue] = await Promise.all([
    query("SELECT COUNT(*) FROM agency_client_assignments WHERE agency_id = $1 AND status = 'active'", [agencyId]),
    query("SELECT COUNT(*) FROM agency_team_members WHERE agency_id = $1 AND status = 'active'", [agencyId]),
    query(`SELECT COUNT(*) FROM campaigns c
           JOIN agency_client_assignments aca ON c.organization_id = aca.client_organization_id
           WHERE aca.agency_id = $1 AND c.status = 'active'`, [agencyId]),
    query(`SELECT COALESCE(SUM(aca.monthly_fee_cents), 0) as total
           FROM agency_client_assignments aca
           WHERE aca.agency_id = $1 AND aca.status = 'active'`, [agencyId])
  ]);

  return {
    total_clients: parseInt(clientCount.rows[0].count),
    total_team_members: parseInt(teamCount.rows[0].count),
    active_campaigns: parseInt(activeCampaigns.rows[0].count),
    monthly_revenue_cents: parseInt(totalRevenue.rows[0].total),
  };
}

// Client Health
export async function getClientHealth(agencyId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT
       aca.id as assignment_id,
       aca.client_organization_id,
       o.name as client_name,
       aca.relationship_type,
       aca.monthly_fee_cents,
       (SELECT COUNT(*) FROM campaigns WHERE organization_id = aca.client_organization_id AND status = 'active') as active_campaigns,
       (SELECT COUNT(*) FROM content WHERE organization_id = aca.client_organization_id AND created_at > NOW() - INTERVAL '30 days') as recent_content,
       (SELECT MAX(created_at) FROM content WHERE organization_id = aca.client_organization_id) as last_activity
     FROM agency_client_assignments aca
     JOIN organizations o ON aca.client_organization_id = o.id
     WHERE aca.agency_id = $1 AND aca.status = 'active'
     ORDER BY o.name`,
    [agencyId]
  );
  return result.rows;
}
