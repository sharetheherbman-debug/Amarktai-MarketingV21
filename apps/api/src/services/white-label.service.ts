import crypto from 'crypto';
import { resolveCname, resolveTxt } from 'dns/promises';
import { query } from '../config/database';
import { NotFoundError, ConflictError, AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { safeFetch, validatePublicHttpUrl } from '../utils/safe-fetch';

export interface WhiteLabelConfig {
  id: string; organization_id: string; brand_name: string | null; brand_logo: string | null;
  brand_favicon: string | null; brand_colors: Record<string, unknown>; brand_font: string | null;
  custom_css: string | null; email_branding: Record<string, unknown>; login_page_config: Record<string, unknown>;
  sidebar_config: Record<string, unknown>; removed_branding: boolean; custom_footer: string | null;
  support_email: string | null; support_url: string | null; terms_url: string | null; privacy_url: string | null;
  created_at: Date; updated_at: Date;
}

export interface CustomDomain {
  id: string; organization_id: string; domain: string; target_cname: string | null; ssl_status: string;
  ssl_issuer: string | null; ssl_expires_at: Date | null; verification_status: string;
  verification_token: string | null; dns_records: unknown[]; is_primary: boolean; status: string;
  created_at: Date; updated_at: Date;
}

export interface ClientPortal {
  id: string; agency_id: string; client_organization_id: string; portal_name: string;
  custom_domain: string | null; subdomain: string | null; branding: Record<string, unknown>;
  features: Record<string, unknown>; settings: Record<string, unknown>; ssl_status: string;
  status: string; created_at: Date; updated_at: Date;
}

export interface UpdateWhiteLabelData {
  brand_name?: string | null; brand_logo?: string | null; brand_favicon?: string | null; brand_colors?: Record<string, unknown>;
  brand_font?: string | null; custom_css?: string; email_branding?: Record<string, unknown>;
  login_page_config?: Record<string, unknown>; sidebar_config?: Record<string, unknown>;
  removed_branding?: boolean; custom_footer?: string; support_email?: string | null; support_url?: string;
  terms_url?: string; privacy_url?: string;
}

function normalizedHex(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new AppError(400, `${field} must be a six-digit hex colour`, 'WHITE_LABEL_COLOR_INVALID');
  return hex.toUpperCase();
}

async function validateBrandLogo(orgId: string, value: string | null | undefined): Promise<string | null | undefined> {
  if (value === undefined || value === null || value.trim() === '') return value === undefined ? undefined : null;
  const logo = value.trim();
  const internal = logo.match(/^\/api\/v1\/studio\/assets\/([0-9a-f-]{36})$/i);
  if (internal) {
    const asset = await query(
      `SELECT 1 FROM studio_assets WHERE id=$1 AND organization_id=$2
        AND deleted_at IS NULL AND mime_type LIKE 'image/%'`,
      [internal[1], orgId]
    );
    if (!asset.rows[0]) throw new AppError(400, 'Select an image owned by this workspace for the brand logo', 'WHITE_LABEL_LOGO_NOT_OWNED');
    return logo;
  }
  await validatePublicHttpUrl(logo);
  const response = await safeFetch(logo, { timeoutMs: 10_000, maxRedirects: 3, maxResponseBytes: 5 * 1024 * 1024 });
  if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) {
    throw new AppError(400, 'Brand logo URL must return a public image', 'WHITE_LABEL_LOGO_INVALID');
  }
  return response.url;
}

export interface AddCustomDomainData { domain: string; target_cname?: string; is_primary?: boolean; }
export interface CreateClientPortalData {
  client_organization_id: string; portal_name: string; custom_domain?: string; subdomain?: string;
  branding?: Record<string, unknown>; features?: Record<string, unknown>; settings?: Record<string, unknown>;
}

function normalizeDomain(value: string): string {
  const input = value.trim().toLowerCase();
  let domain = input;
  try { domain = new URL(input.includes('://') ? input : `https://${input}`).hostname.toLowerCase(); }
  catch { throw new AppError(400, 'Invalid domain name', 'DOMAIN_INVALID'); }
  domain = domain.replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new AppError(400, 'Invalid public domain name', 'DOMAIN_INVALID');
  }
  if (domain.endsWith('.local') || domain.endsWith('.localhost')) {
    throw new AppError(400, 'Local domains are not supported', 'DOMAIN_INVALID');
  }
  return domain;
}

function verificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function getWhiteLabelConfig(orgId: string): Promise<WhiteLabelConfig> {
  const result = await query('SELECT * FROM white_label_configs WHERE organization_id=$1', [orgId]);
  if (result.rows.length > 0) return result.rows[0];
  const inserted = await query(
    `INSERT INTO white_label_configs (organization_id,brand_colors,email_branding,login_page_config,sidebar_config)
     VALUES ($1,'{}','{}','{}','{}') RETURNING *`,
    [orgId]
  );
  return inserted.rows[0];
}

export async function updateWhiteLabelConfig(orgId: string, data: UpdateWhiteLabelData): Promise<WhiteLabelConfig> {
  await getWhiteLabelConfig(orgId);
  const validatedLogo = await validateBrandLogo(orgId, data.brand_logo);
  const colors = data.brand_colors === undefined ? undefined : {
    ...data.brand_colors,
    ...(data.brand_colors.primary !== undefined
      ? { primary: normalizedHex(data.brand_colors.primary, 'Primary colour') }
      : {}),
    ...(data.brand_colors.accent !== undefined || data.brand_colors.secondary !== undefined
      ? { accent: normalizedHex(data.brand_colors.accent ?? data.brand_colors.secondary, 'Accent colour') }
      : {}),
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  let parameter = 1;
  const add = (column: string, value: unknown) => { updates.push(`${column}=$${parameter++}`); values.push(value); };
  if (data.brand_name !== undefined) add('brand_name', data.brand_name);
  if (validatedLogo !== undefined) add('brand_logo', validatedLogo);
  if (data.brand_favicon !== undefined) add('brand_favicon', data.brand_favicon);
  if (colors !== undefined) add('brand_colors', JSON.stringify(colors));
  if (data.brand_font !== undefined) add('brand_font', data.brand_font);
  if (data.custom_css !== undefined) add('custom_css', data.custom_css);
  if (data.email_branding !== undefined) add('email_branding', JSON.stringify(data.email_branding));
  if (data.login_page_config !== undefined) add('login_page_config', JSON.stringify(data.login_page_config));
  if (data.sidebar_config !== undefined) add('sidebar_config', JSON.stringify(data.sidebar_config));
  if (data.removed_branding !== undefined) add('removed_branding', data.removed_branding);
  if (data.custom_footer !== undefined) add('custom_footer', data.custom_footer);
  if (data.support_email !== undefined) add('support_email', data.support_email);
  if (data.support_url !== undefined) add('support_url', data.support_url);
  if (data.terms_url !== undefined) add('terms_url', data.terms_url);
  if (data.privacy_url !== undefined) add('privacy_url', data.privacy_url);
  if (updates.length === 0) return getWhiteLabelConfig(orgId);
  updates.push('updated_at=NOW()');
  values.push(orgId);
  const result = await query(`UPDATE white_label_configs SET ${updates.join(',')} WHERE organization_id=$${parameter} RETURNING *`, values);
  return result.rows[0];
}

export async function getCustomDomains(orgId: string): Promise<CustomDomain[]> {
  const result = await query('SELECT * FROM custom_domains WHERE organization_id=$1 ORDER BY is_primary DESC,domain', [orgId]);
  return result.rows;
}

export async function addCustomDomain(orgId: string, data: AddCustomDomainData): Promise<CustomDomain> {
  const domain = normalizeDomain(data.domain);
  const targetCname = data.target_cname ? normalizeDomain(data.target_cname) : null;
  const existing = await query('SELECT id FROM custom_domains WHERE domain=$1', [domain]);
  if (existing.rows.length > 0) throw new ConflictError('Domain already exists');
  if (data.is_primary) await query('UPDATE custom_domains SET is_primary=FALSE WHERE organization_id=$1', [orgId]);
  const token = verificationToken();
  const result = await query(
    `INSERT INTO custom_domains
       (organization_id,domain,target_cname,is_primary,verification_token,verification_status,ssl_status,dns_records)
     VALUES ($1,$2,$3,$4,$5,'pending','pending',$6) RETURNING *`,
    [orgId, domain, targetCname, data.is_primary || false, token, JSON.stringify([
      { type: 'TXT', name: `_amarktai.${domain}`, value: `amarktai-verification=${token}` },
      ...(targetCname ? [{ type: 'CNAME', name: domain, value: targetCname }] : []),
    ])]
  );
  logger.info(`Custom domain added for DNS verification: ${domain}`);
  return result.rows[0];
}

export async function verifyCustomDomain(domainId: string, orgId: string): Promise<CustomDomain> {
  const domainResult = await query('SELECT * FROM custom_domains WHERE id=$1 AND organization_id=$2', [domainId, orgId]);
  if (domainResult.rows.length === 0) throw new NotFoundError('Custom domain');
  const domain = domainResult.rows[0];
  const records: Array<Record<string, unknown>> = [];
  let verified = false;

  try {
    const txtRows = await resolveTxt(`_amarktai.${domain.domain}`);
    const values = txtRows.map((parts) => parts.join(''));
    records.push({ type: 'TXT', name: `_amarktai.${domain.domain}`, values });
    verified = values.some((value) => value === String(domain.verification_token) || value === `amarktai-verification=${domain.verification_token}`);
  } catch (error) {
    records.push({ type: 'TXT', name: `_amarktai.${domain.domain}`, error: error instanceof Error ? error.message : String(error) });
  }

  if (!verified && domain.target_cname) {
    try {
      const cnames = (await resolveCname(String(domain.domain))).map((value) => value.toLowerCase().replace(/\.$/, ''));
      records.push({ type: 'CNAME', name: domain.domain, values: cnames });
      verified = cnames.includes(String(domain.target_cname).toLowerCase().replace(/\.$/, ''));
    } catch (error) {
      records.push({ type: 'CNAME', name: domain.domain, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!verified) {
    await query('UPDATE custom_domains SET dns_records=$1,verification_status=\'pending\',updated_at=NOW() WHERE id=$2', [JSON.stringify(records), domainId]);
    throw new AppError(409, `DNS verification failed. Add TXT _amarktai.${domain.domain} with value amarktai-verification=${domain.verification_token}`, 'DOMAIN_VERIFICATION_PENDING');
  }

  const result = await query(
    `UPDATE custom_domains SET verification_status='verified',status='active',ssl_status='pending',dns_records=$1,updated_at=NOW()
     WHERE id=$2 AND organization_id=$3 RETURNING *`,
    [JSON.stringify(records), domainId, orgId]
  );
  logger.info(`Custom domain DNS verified: ${domain.domain}`);
  return result.rows[0];
}

export async function removeCustomDomain(domainId: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM custom_domains WHERE id=$1 AND organization_id=$2', [domainId, orgId]);
  if (result.rowCount === 0) throw new NotFoundError('Custom domain');
}

export async function isAuthorizedCustomDomain(domainValue: string): Promise<boolean> {
  let domain: string;
  try { domain = normalizeDomain(domainValue); } catch { return false; }
  const result = await query(
    `SELECT 1 FROM custom_domains
     WHERE domain=$1 AND verification_status='verified' AND status='active'
     UNION ALL
     SELECT 1 FROM client_portals
     WHERE custom_domain=$1 AND status='active'
     LIMIT 1`,
    [domain]
  );
  return result.rows.length > 0;
}

export async function getClientPortals(agencyId: string): Promise<ClientPortal[]> {
  const result = await query(
    `SELECT cp.*,o.name AS client_name FROM client_portals cp
     JOIN organizations o ON o.id=cp.client_organization_id
     WHERE cp.agency_id=$1 AND cp.status <> 'deleted' ORDER BY cp.created_at DESC`,
    [agencyId]
  );
  return result.rows;
}

async function assertAssignedClient(agencyId: string, clientOrganizationId: string): Promise<void> {
  const result = await query(
    `SELECT 1 FROM agency_client_assignments
     WHERE agency_id=$1 AND client_organization_id=$2 AND status='active'`,
    [agencyId, clientOrganizationId]
  );
  if (result.rows.length === 0) throw new AppError(403, 'Client organization is not actively assigned to this agency', 'CLIENT_NOT_ASSIGNED');
}

async function assertVerifiedPortalDomain(agencyId: string, domainValue: string): Promise<string> {
  const domain = normalizeDomain(domainValue);
  const result = await query(
    `SELECT 1 FROM custom_domains cd
     JOIN agencies a ON a.organization_id=cd.organization_id
     WHERE a.id=$1 AND cd.domain=$2 AND cd.verification_status='verified' AND cd.status='active'`,
    [agencyId, domain]
  );
  if (result.rows.length === 0) throw new AppError(409, 'Custom domain must be DNS verified before it can be assigned to a portal', 'DOMAIN_NOT_VERIFIED');
  return domain;
}

export async function createClientPortal(agencyId: string, data: CreateClientPortalData): Promise<ClientPortal> {
  await assertAssignedClient(agencyId, data.client_organization_id);
  const customDomain = data.custom_domain ? await assertVerifiedPortalDomain(agencyId, data.custom_domain) : null;
  const existing = await query('SELECT id FROM client_portals WHERE agency_id=$1 AND client_organization_id=$2 AND status <> \'deleted\'', [agencyId, data.client_organization_id]);
  if (existing.rows.length > 0) throw new ConflictError('Portal already exists for this client');
  if (customDomain) {
    const duplicate = await query('SELECT id FROM client_portals WHERE custom_domain=$1 AND status <> \'deleted\'', [customDomain]);
    if (duplicate.rows.length > 0) throw new ConflictError('Custom domain already in use');
  }
  const result = await query(
    `INSERT INTO client_portals
       (agency_id,client_organization_id,portal_name,custom_domain,subdomain,branding,features,settings,ssl_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [agencyId, data.client_organization_id, data.portal_name, customDomain, data.subdomain || null,
      JSON.stringify(data.branding || {}), JSON.stringify(data.features || {}), JSON.stringify(data.settings || {}), customDomain ? 'pending' : 'not_required']
  );
  return result.rows[0];
}

export async function updateClientPortal(portalId: string, agencyId: string, data: Partial<CreateClientPortalData>): Promise<ClientPortal> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let parameter = 1;
  const add = (column: string, value: unknown) => { updates.push(`${column}=$${parameter++}`); values.push(value); };
  if (data.client_organization_id !== undefined) {
    await assertAssignedClient(agencyId, data.client_organization_id);
    add('client_organization_id', data.client_organization_id);
  }
  if (data.portal_name !== undefined) add('portal_name', data.portal_name);
  if (data.custom_domain !== undefined) {
    const customDomain = data.custom_domain ? await assertVerifiedPortalDomain(agencyId, data.custom_domain) : null;
    add('custom_domain', customDomain);
    add('ssl_status', customDomain ? 'pending' : 'not_required');
  }
  if (data.subdomain !== undefined) add('subdomain', data.subdomain || null);
  if (data.branding !== undefined) add('branding', JSON.stringify(data.branding));
  if (data.features !== undefined) add('features', JSON.stringify(data.features));
  if (data.settings !== undefined) add('settings', JSON.stringify(data.settings));
  if (updates.length === 0) {
    const result = await query('SELECT * FROM client_portals WHERE id=$1 AND agency_id=$2 AND status <> \'deleted\'', [portalId, agencyId]);
    if (result.rows.length === 0) throw new NotFoundError('Client portal');
    return result.rows[0];
  }
  updates.push('updated_at=NOW()');
  values.push(portalId, agencyId);
  const result = await query(`UPDATE client_portals SET ${updates.join(',')} WHERE id=$${parameter} AND agency_id=$${parameter + 1} RETURNING *`, values);
  if (result.rows.length === 0) throw new NotFoundError('Client portal');
  return result.rows[0];
}

export async function removeClientPortal(portalId: string, agencyId: string): Promise<void> {
  const result = await query("UPDATE client_portals SET status='deleted',updated_at=NOW() WHERE id=$1 AND agency_id=$2", [portalId, agencyId]);
  if (result.rowCount === 0) throw new NotFoundError('Client portal');
}

export async function logPortalAccess(portalId: string, userId: string | null, action: string, ipAddress?: string, userAgent?: string): Promise<void> {
  await query(
    'INSERT INTO portal_access_logs (portal_id,user_id,action,ip_address,user_agent) VALUES ($1,$2,$3,$4,$5)',
    [portalId, userId, action, ipAddress || null, userAgent || null]
  );
}

export async function getPortalAccessLogs(portalId: string, agencyId: string, limit = 50): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT pal.*,u.name AS user_name,u.email AS user_email
     FROM portal_access_logs pal
     JOIN client_portals cp ON cp.id=pal.portal_id
     LEFT JOIN users u ON u.id=pal.user_id
     WHERE pal.portal_id=$1 AND cp.agency_id=$2
     ORDER BY pal.created_at DESC LIMIT $3`,
    [portalId, agencyId, Math.max(1, Math.min(Number(limit) || 50, 200))]
  );
  return result.rows;
}
