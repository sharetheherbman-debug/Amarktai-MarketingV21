import { query } from '../config/database';
import { NotFoundError, ConflictError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface WhiteLabelConfig {
  id: string;
  organization_id: string;
  brand_name: string | null;
  brand_logo: string | null;
  brand_favicon: string | null;
  brand_colors: Record<string, unknown>;
  brand_font: string | null;
  custom_css: string | null;
  email_branding: Record<string, unknown>;
  login_page_config: Record<string, unknown>;
  sidebar_config: Record<string, unknown>;
  removed_branding: boolean;
  custom_footer: string | null;
  support_email: string | null;
  support_url: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CustomDomain {
  id: string;
  organization_id: string;
  domain: string;
  target_cname: string | null;
  ssl_status: string;
  ssl_issuer: string | null;
  ssl_expires_at: Date | null;
  verification_status: string;
  verification_token: string | null;
  dns_records: unknown[];
  is_primary: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface ClientPortal {
  id: string;
  agency_id: string;
  client_organization_id: string;
  portal_name: string;
  custom_domain: string | null;
  subdomain: string | null;
  branding: Record<string, unknown>;
  features: Record<string, unknown>;
  settings: Record<string, unknown>;
  ssl_status: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateWhiteLabelData {
  brand_name?: string;
  brand_logo?: string;
  brand_favicon?: string;
  brand_colors?: Record<string, unknown>;
  brand_font?: string;
  custom_css?: string;
  email_branding?: Record<string, unknown>;
  login_page_config?: Record<string, unknown>;
  sidebar_config?: Record<string, unknown>;
  removed_branding?: boolean;
  custom_footer?: string;
  support_email?: string;
  support_url?: string;
  terms_url?: string;
  privacy_url?: string;
}

export interface AddCustomDomainData {
  domain: string;
  target_cname?: string;
  is_primary?: boolean;
}

export interface CreateClientPortalData {
  client_organization_id: string;
  portal_name: string;
  custom_domain?: string;
  subdomain?: string;
  branding?: Record<string, unknown>;
  features?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// White Label Config
export async function getWhiteLabelConfig(orgId: string): Promise<WhiteLabelConfig> {
  const result = await query(
    'SELECT * FROM white_label_configs WHERE organization_id = $1',
    [orgId]
  );
  if (result.rows.length === 0) {
    // Create default config
    const insertResult = await query(
      `INSERT INTO white_label_configs (organization_id, brand_colors, email_branding, login_page_config, sidebar_config)
       VALUES ($1, '{}', '{}', '{}', '{}')
       RETURNING *`,
      [orgId]
    );
    return insertResult.rows[0];
  }
  return result.rows[0];
}

export async function updateWhiteLabelConfig(orgId: string, data: UpdateWhiteLabelData): Promise<WhiteLabelConfig> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.brand_name !== undefined) { updates.push(`brand_name = $${paramCount++}`); values.push(data.brand_name); }
  if (data.brand_logo !== undefined) { updates.push(`brand_logo = $${paramCount++}`); values.push(data.brand_logo); }
  if (data.brand_favicon !== undefined) { updates.push(`brand_favicon = $${paramCount++}`); values.push(data.brand_favicon); }
  if (data.brand_colors !== undefined) { updates.push(`brand_colors = $${paramCount++}`); values.push(JSON.stringify(data.brand_colors)); }
  if (data.brand_font !== undefined) { updates.push(`brand_font = $${paramCount++}`); values.push(data.brand_font); }
  if (data.custom_css !== undefined) { updates.push(`custom_css = $${paramCount++}`); values.push(data.custom_css); }
  if (data.email_branding !== undefined) { updates.push(`email_branding = $${paramCount++}`); values.push(JSON.stringify(data.email_branding)); }
  if (data.login_page_config !== undefined) { updates.push(`login_page_config = $${paramCount++}`); values.push(JSON.stringify(data.login_page_config)); }
  if (data.sidebar_config !== undefined) { updates.push(`sidebar_config = $${paramCount++}`); values.push(JSON.stringify(data.sidebar_config)); }
  if (data.removed_branding !== undefined) { updates.push(`removed_branding = $${paramCount++}`); values.push(data.removed_branding); }
  if (data.custom_footer !== undefined) { updates.push(`custom_footer = $${paramCount++}`); values.push(data.custom_footer); }
  if (data.support_email !== undefined) { updates.push(`support_email = $${paramCount++}`); values.push(data.support_email); }
  if (data.support_url !== undefined) { updates.push(`support_url = $${paramCount++}`); values.push(data.support_url); }
  if (data.terms_url !== undefined) { updates.push(`terms_url = $${paramCount++}`); values.push(data.terms_url); }
  if (data.privacy_url !== undefined) { updates.push(`privacy_url = $${paramCount++}`); values.push(data.privacy_url); }

  if (updates.length === 0) {
    return getWhiteLabelConfig(orgId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(orgId);

  const result = await query(
    `UPDATE white_label_configs SET ${updates.join(', ')} WHERE organization_id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('White label config');
  }

  logger.info(`White label config updated: ${orgId}`);
  return result.rows[0];
}

// Custom Domains
export async function getCustomDomains(orgId: string): Promise<CustomDomain[]> {
  const result = await query(
    'SELECT * FROM custom_domains WHERE organization_id = $1 ORDER BY is_primary DESC, domain',
    [orgId]
  );
  return result.rows;
}

export async function addCustomDomain(orgId: string, data: AddCustomDomainData): Promise<CustomDomain> {
  const existing = await query(
    'SELECT id FROM custom_domains WHERE domain = $1',
    [data.domain]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('Domain already exists');
  }

  if (data.is_primary) {
    await query(
      'UPDATE custom_domains SET is_primary = FALSE WHERE organization_id = $1',
      [orgId]
    );
  }

  const result = await query(
    `INSERT INTO custom_domains (organization_id, domain, target_cname, is_primary, verification_token)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [orgId, data.domain, data.target_cname || null, data.is_primary || false, generateVerificationToken()]
  );

  logger.info(`Custom domain added: ${data.domain} for org ${orgId}`);
  return result.rows[0];
}

export async function verifyCustomDomain(domainId: string, orgId: string): Promise<CustomDomain> {
  const result = await query(
    `UPDATE custom_domains SET verification_status = 'verified', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [domainId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Custom domain');
  logger.info(`Custom domain verified: ${domainId}`);
  return result.rows[0];
}

export async function removeCustomDomain(domainId: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM custom_domains WHERE id = $1 AND organization_id = $2',
    [domainId, orgId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Custom domain');
  logger.info(`Custom domain removed: ${domainId}`);
}

// Client Portals
export async function getClientPortals(agencyId: string): Promise<ClientPortal[]> {
  const result = await query(
    `SELECT cp.*, o.name as client_name
     FROM client_portals cp
     JOIN organizations o ON cp.client_organization_id = o.id
     WHERE cp.agency_id = $1
     ORDER BY cp.created_at DESC`,
    [agencyId]
  );
  return result.rows;
}

export async function createClientPortal(agencyId: string, data: CreateClientPortalData): Promise<ClientPortal> {
  const existing = await query(
    'SELECT id FROM client_portals WHERE agency_id = $1 AND client_organization_id = $2',
    [agencyId, data.client_organization_id]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('Portal already exists for this client');
  }

  if (data.custom_domain) {
    const domainExists = await query(
      'SELECT id FROM client_portals WHERE custom_domain = $1',
      [data.custom_domain]
    );
    if (domainExists.rows.length > 0) {
      throw new ConflictError('Custom domain already in use');
    }
  }

  const result = await query(
    `INSERT INTO client_portals (agency_id, client_organization_id, portal_name, custom_domain, subdomain, branding, features, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      agencyId, data.client_organization_id, data.portal_name,
      data.custom_domain || null, data.subdomain || null,
      JSON.stringify(data.branding || {}), JSON.stringify(data.features || {}),
      JSON.stringify(data.settings || {})
    ]
  );

  logger.info(`Client portal created: ${data.portal_name} for agency ${agencyId}`);
  return result.rows[0];
}

export async function updateClientPortal(portalId: string, agencyId: string, data: Partial<CreateClientPortalData>): Promise<ClientPortal> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.portal_name !== undefined) { updates.push(`portal_name = $${paramCount++}`); values.push(data.portal_name); }
  if (data.custom_domain !== undefined) { updates.push(`custom_domain = $${paramCount++}`); values.push(data.custom_domain); }
  if (data.subdomain !== undefined) { updates.push(`subdomain = $${paramCount++}`); values.push(data.subdomain); }
  if (data.branding !== undefined) { updates.push(`branding = $${paramCount++}`); values.push(JSON.stringify(data.branding)); }
  if (data.features !== undefined) { updates.push(`features = $${paramCount++}`); values.push(JSON.stringify(data.features)); }
  if (data.settings !== undefined) { updates.push(`settings = $${paramCount++}`); values.push(JSON.stringify(data.settings)); }

  if (updates.length === 0) {
    const result = await query('SELECT * FROM client_portals WHERE id = $1 AND agency_id = $2', [portalId, agencyId]);
    if (result.rows.length === 0) throw new NotFoundError('Client portal');
    return result.rows[0];
  }

  updates.push(`updated_at = NOW()`);
  values.push(portalId, agencyId);

  const result = await query(
    `UPDATE client_portals SET ${updates.join(', ')} WHERE id = $${paramCount} AND agency_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Client portal');
  logger.info(`Client portal updated: ${portalId}`);
  return result.rows[0];
}

export async function removeClientPortal(portalId: string, agencyId: string): Promise<void> {
  const result = await query(
    "UPDATE client_portals SET status = 'deleted', updated_at = NOW() WHERE id = $1 AND agency_id = $2",
    [portalId, agencyId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Client portal');
  logger.info(`Client portal removed: ${portalId}`);
}

// Portal Access Logging
export async function logPortalAccess(portalId: string, userId: string | null, action: string, ipAddress?: string, userAgent?: string): Promise<void> {
  await query(
    `INSERT INTO portal_access_logs (portal_id, user_id, action, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [portalId, userId, action, ipAddress || null, userAgent || null]
  );
}

export async function getPortalAccessLogs(portalId: string, limit: number = 50): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT pal.*, u.name as user_name, u.email as user_email
     FROM portal_access_logs pal
     LEFT JOIN users u ON pal.user_id = u.id
     WHERE pal.portal_id = $1
     ORDER BY pal.created_at DESC
     LIMIT $2`,
    [portalId, limit]
  );
  return result.rows;
}

function generateVerificationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
