import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import { contextEngine } from './context-engine.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrmCompany {
  id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  revenue_range: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown>;
  social_links: Record<string, unknown>;
  tags: string[];
  custom_fields: Record<string, unknown>;
  ai_summary: string | null;
  ai_insights: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CrmContact {
  id: string;
  organization_id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  lead_score: number;
  lead_status: string;
  lead_source: string | null;
  owner_id: string | null;
  ai_summary: string | null;
  ai_insights: Record<string, unknown>;
  ai_next_action: string | null;
  last_contacted_at: string | null;
  last_activity_at: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CrmDeal {
  id: string;
  organization_id: string;
  contact_id: string | null;
  company_id: string | null;
  name: string;
  description: string | null;
  stage: string;
  value_cents: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  pipeline: string;
  win_reason: string | null;
  loss_reason: string | null;
  products: unknown[];
  tags: string[];
  owner_id: string | null;
  ai_health_score: number;
  ai_forecast: Record<string, unknown>;
  ai_summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CrmCustomer {
  id: string;
  organization_id: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  customer_type: string;
  health_score: number;
  nps_score: number | null;
  satisfaction_score: number | null;
  churn_risk: number;
  onboarding_status: string;
  onboarding_progress: number;
  renewal_date: string | null;
  renewal_value_cents: number;
  lifetime_value_cents: number;
  expansion_opportunities: unknown[];
  success_plan: Record<string, unknown>;
  ai_health_summary: string | null;
  ai_retention_recommendations: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CrmActivity {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  subject: string | null;
  description: string | null;
  duration_minutes: number | null;
  outcome: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
}

export interface CrmTask {
  id: string;
  organization_id: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_at: string;
}

export interface CrmEmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
  variables: string[];
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

// ─── Companies ───────────────────────────────────────────────────────────────

export async function listCompanies(orgId: string, search?: string): Promise<CrmCompany[]> {
  let sql = 'SELECT * FROM crm_companies WHERE organization_id = $1 AND deleted_at IS NULL';
  const params: unknown[] = [orgId];
  if (search) { sql += ` AND (name ILIKE $2 OR domain ILIKE $2 OR industry ILIKE $2)`; params.push(`%${search}%`); }
  sql += ' ORDER BY name ASC';
  const result = await query(sql, params);
  return result.rows.map(mapCompanyRow);
}

export async function getCompanyById(id: string, orgId: string): Promise<CrmCompany> {
  const result = await query('SELECT * FROM crm_companies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Company');
  return mapCompanyRow(result.rows[0]);
}

export async function createCompany(orgId: string, data: Partial<CrmCompany>, userId: string): Promise<CrmCompany> {
  const result = await query(
    `INSERT INTO crm_companies (organization_id, name, domain, industry, size, description, website, phone, email, address, tags, custom_fields, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [orgId, data.name, data.domain || null, data.industry || null, data.size || null, data.description || null, data.website || null, data.phone || null, data.email || null, JSON.stringify(data.address || {}), JSON.stringify(data.tags || []), JSON.stringify(data.custom_fields || {}), userId]
  );
  logger.info(`Company created: ${data.name}`);
  return mapCompanyRow(result.rows[0]);
}

export async function updateCompany(id: string, orgId: string, data: Partial<CrmCompany>): Promise<CrmCompany> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && !['id', 'organization_id', 'created_at', 'updated_at'].includes(key)) {
      updates.push(`${key} = $${idx++}`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }
  if (updates.length === 0) return getCompanyById(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);
  const result = await query(`UPDATE crm_companies SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`, values);
  return mapCompanyRow(result.rows[0]);
}

export async function deleteCompany(id: string, orgId: string): Promise<void> {
  await query('UPDATE crm_companies SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export async function listContacts(orgId: string, filters?: { status?: string; owner_id?: string; company_id?: string; search?: string }): Promise<CrmContact[]> {
  let sql = 'SELECT * FROM crm_contacts WHERE organization_id = $1 AND deleted_at IS NULL';
  const params: unknown[] = [orgId];
  let idx = 2;
  if (filters?.status) { sql += ` AND lead_status = $${idx++}`; params.push(filters.status); }
  if (filters?.owner_id) { sql += ` AND owner_id = $${idx++}`; params.push(filters.owner_id); }
  if (filters?.company_id) { sql += ` AND company_id = $${idx++}`; params.push(filters.company_id); }
  if (filters?.search) { sql += ` AND (first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx})`; params.push(`%${filters.search}%`); idx++; }
  sql += ' ORDER BY lead_score DESC, created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapContactRow);
}

export async function getContactById(id: string, orgId: string): Promise<CrmContact> {
  const result = await query('SELECT * FROM crm_contacts WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Contact');
  return mapContactRow(result.rows[0]);
}

export async function createContact(orgId: string, data: Partial<CrmContact>, userId: string): Promise<CrmContact> {
  const result = await query(
    `INSERT INTO crm_contacts (organization_id, company_id, first_name, last_name, email, phone, title, department, lead_source, owner_id, tags, custom_fields, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [orgId, data.company_id || null, data.first_name, data.last_name, data.email || null, data.phone || null, data.title || null, data.department || null, data.lead_source || null, data.owner_id || null, JSON.stringify(data.tags || []), JSON.stringify(data.custom_fields || {}), userId]
  );
  logger.info(`Contact created: ${data.first_name} ${data.last_name}`);
  return mapContactRow(result.rows[0]);
}

export async function updateContact(id: string, orgId: string, data: Partial<CrmContact>): Promise<CrmContact> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && !['id', 'organization_id', 'created_at', 'updated_at'].includes(key)) {
      updates.push(`${key} = $${idx++}`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }
  if (updates.length === 0) return getContactById(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);
  const result = await query(`UPDATE crm_contacts SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`, values);
  return mapContactRow(result.rows[0]);
}

export async function deleteContact(id: string, orgId: string): Promise<void> {
  await query('UPDATE crm_contacts SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

// ─── AI Lead Scoring ─────────────────────────────────────────────────────────

export async function scoreContact(contactId: string, orgId: string): Promise<{ score: number; factors: string[]; next_action: string }> {
  const contact = await getContactById(contactId, orgId);
  const activities = await listActivities(orgId, 'contact', contactId);
  const deals = await listDeals(orgId, { contact_id: contactId });

  const context = await contextEngine.assemble({ orgId, agentId: '', includeBrandDna: true });

  const prompt = `Score this lead from 0-100 and recommend next action.

Contact: ${contact.first_name} ${contact.last_name}
Title: ${contact.title || 'Unknown'}
Company: ${contact.company_id ? 'Has company' : 'No company'}
Email: ${contact.email || 'None'}
Lead Source: ${contact.lead_source || 'Unknown'}
Activities: ${activities.length}
Open Deals: ${deals.filter(d => d.status === 'open').length}
Total Deal Value: $${deals.reduce((sum, d) => sum + d.value_cents, 0) / 100}

${context.brandDna ? `Brand: ${context.brandDna.substring(0, 300)}` : ''}

Return JSON: {"score":0,"factors":["..."],"next_action":"..."}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 1000, temperature: 0.3 },
      { organizationId: orgId }
    );
    const parsed = JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
    await query('UPDATE crm_contacts SET lead_score = $1, ai_next_action = $2, ai_insights = $3 WHERE id = $4', [parsed.score, parsed.next_action, JSON.stringify({ factors: parsed.factors }), contactId]);
    return parsed;
  } catch {
    return { score: contact.lead_score, factors: [], next_action: 'Follow up' };
  }
}

// ─── Deals ───────────────────────────────────────────────────────────────────

export async function listDeals(orgId: string, filters?: { stage?: string; status?: string; owner_id?: string; contact_id?: string }): Promise<CrmDeal[]> {
  let sql = 'SELECT * FROM crm_deals WHERE organization_id = $1 AND deleted_at IS NULL';
  const params: unknown[] = [orgId];
  let idx = 2;
  if (filters?.stage) { sql += ` AND stage = $${idx++}`; params.push(filters.stage); }
  if (filters?.status) { sql += ` AND status = $${idx++}`; params.push(filters.status); }
  if (filters?.owner_id) { sql += ` AND owner_id = $${idx++}`; params.push(filters.owner_id); }
  if (filters?.contact_id) { sql += ` AND contact_id = $${idx++}`; params.push(filters.contact_id); }
  sql += ' ORDER BY value_cents DESC, created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapDealRow);
}

export async function getDealById(id: string, orgId: string): Promise<CrmDeal> {
  const result = await query('SELECT * FROM crm_deals WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Deal');
  return mapDealRow(result.rows[0]);
}

export async function createDeal(orgId: string, data: Partial<CrmDeal>, userId: string): Promise<CrmDeal> {
  const result = await query(
    `INSERT INTO crm_deals (organization_id, contact_id, company_id, name, description, stage, value_cents, probability, expected_close_date, pipeline, products, tags, owner_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [orgId, data.contact_id || null, data.company_id || null, data.name, data.description || null, data.stage || 'qualification', data.value_cents || 0, data.probability || 0, data.expected_close_date || null, data.pipeline || 'default', JSON.stringify(data.products || []), JSON.stringify(data.tags || []), data.owner_id || null, userId]
  );
  logger.info(`Deal created: ${data.name}`);
  return mapDealRow(result.rows[0]);
}

export async function updateDeal(id: string, orgId: string, data: Partial<CrmDeal>): Promise<CrmDeal> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && !['id', 'organization_id', 'created_at', 'updated_at'].includes(key)) {
      updates.push(`${key} = $${idx++}`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }
  if (updates.length === 0) return getDealById(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);
  const result = await query(`UPDATE crm_deals SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`, values);
  return mapDealRow(result.rows[0]);
}

// ─── AI Deal Health ──────────────────────────────────────────────────────────

export async function analyzeDeal(dealId: string, orgId: string): Promise<{ health_score: number; forecast: Record<string, unknown>; summary: string }> {
  const deal = await getDealById(dealId, orgId);
  const activities = await listActivities(orgId, 'deal', dealId);

  const prompt = `Analyze this sales deal and provide health score and forecast.

Deal: ${deal.name}
Stage: ${deal.stage}
Value: $${deal.value_cents / 100}
Probability: ${deal.probability}%
Expected Close: ${deal.expected_close_date || 'Unknown'}
Days in pipeline: ${Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)}
Activities: ${activities.length}
Description: ${deal.description || 'None'}

Return JSON: {"health_score":0-100,"forecast":{"win_probability":0,"expected_value":0,"risk_factors":["..."]},"summary":"..."}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 1500, temperature: 0.3 },
      { organizationId: orgId }
    );
    const parsed = JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
    await query('UPDATE crm_deals SET ai_health_score = $1, ai_forecast = $2, ai_summary = $3 WHERE id = $4', [parsed.health_score, JSON.stringify(parsed.forecast), parsed.summary, dealId]);
    return parsed;
  } catch {
    return { health_score: deal.ai_health_score, forecast: deal.ai_forecast, summary: deal.ai_summary || '' };
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function listCustomers(orgId: string, filters?: { status?: string; risk?: string }): Promise<CrmCustomer[]> {
  let sql = 'SELECT * FROM crm_customers WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  let idx = 2;
  if (filters?.status) { sql += ` AND status = $${idx++}`; params.push(filters.status); }
  sql += ' ORDER BY health_score ASC, churn_risk DESC';
  const result = await query(sql, params);
  return result.rows.map(mapCustomerRow);
}

export async function getCustomerById(id: string, orgId: string): Promise<CrmCustomer> {
  const result = await query('SELECT * FROM crm_customers WHERE id = $1 AND organization_id = $2', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Customer');
  return mapCustomerRow(result.rows[0]);
}

export async function createCustomer(orgId: string, data: Partial<CrmCustomer>): Promise<CrmCustomer> {
  const result = await query(
    `INSERT INTO crm_customers (organization_id, contact_id, company_id, deal_id, customer_type, health_score, renewal_date, renewal_value_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, data.contact_id || null, data.company_id || null, data.deal_id || null, data.customer_type || 'standard', data.health_score || 50, data.renewal_date || null, data.renewal_value_cents || 0]
  );
  return mapCustomerRow(result.rows[0]);
}

export async function updateCustomer(id: string, orgId: string, data: Partial<CrmCustomer>): Promise<CrmCustomer> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && !['id', 'organization_id', 'created_at', 'updated_at'].includes(key)) {
      updates.push(`${key} = $${idx++}`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }
  if (updates.length === 0) return getCustomerById(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);
  const result = await query(`UPDATE crm_customers SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`, values);
  return mapCustomerRow(result.rows[0]);
}

// ─── AI Customer Health ──────────────────────────────────────────────────────

export async function analyzeCustomer(customerId: string, orgId: string): Promise<{ health_score: number; churn_risk: number; recommendations: string[]; summary: string }> {
  const customer = await getCustomerById(customerId, orgId);

  const prompt = `Analyze this customer's health and churn risk.

Customer Type: ${customer.customer_type}
Health Score: ${customer.health_score}/100
NPS: ${customer.nps_score ?? 'Not collected'}
Satisfaction: ${customer.satisfaction_score ?? 'Not measured'}
Onboarding: ${customer.onboarding_status} (${customer.onboarding_progress}%)
Renewal Date: ${customer.renewal_date || 'Unknown'}
Lifetime Value: $${customer.lifetime_value_cents / 100}

Return JSON: {"health_score":0-100,"churn_risk":0-100,"recommendations":["..."],"summary":"..."}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 1500, temperature: 0.3 },
      { organizationId: orgId }
    );
    const parsed = JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
    await query('UPDATE crm_customers SET health_score = $1, churn_risk = $2, ai_retention_recommendations = $3, ai_health_summary = $4 WHERE id = $5',
      [parsed.health_score, parsed.churn_risk, JSON.stringify(parsed.recommendations), parsed.summary, customerId]);
    return parsed;
  } catch {
    return { health_score: customer.health_score, churn_risk: customer.churn_risk, recommendations: [], summary: customer.ai_health_summary || '' };
  }
}

// ─── Activities ──────────────────────────────────────────────────────────────

export async function listActivities(orgId: string, entityType: string, entityId: string): Promise<CrmActivity[]> {
  const result = await query(
    'SELECT * FROM crm_activities WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 ORDER BY created_at DESC',
    [orgId, entityType, entityId]
  );
  return result.rows.map(mapActivityRow);
}

export async function createActivity(orgId: string, data: Partial<CrmActivity>, userId: string): Promise<CrmActivity> {
  const result = await query(
    `INSERT INTO crm_activities (organization_id, entity_type, entity_id, type, subject, description, duration_minutes, outcome, scheduled_at, status, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [orgId, data.entity_type, data.entity_id, data.type, data.subject || null, data.description || null, data.duration_minutes || null, data.outcome || null, data.scheduled_at || null, data.status || 'planned', data.assigned_to || null, userId]
  );
  return mapActivityRow(result.rows[0]);
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function listTasks(orgId: string, filters?: { assigned_to?: string; status?: string }): Promise<CrmTask[]> {
  let sql = 'SELECT * FROM crm_tasks WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  let idx = 2;
  if (filters?.assigned_to) { sql += ` AND assigned_to = $${idx++}`; params.push(filters.assigned_to); }
  if (filters?.status) { sql += ` AND status = $${idx++}`; params.push(filters.status); }
  sql += ' ORDER BY due_date ASC NULLS LAST, priority DESC';
  const result = await query(sql, params);
  return result.rows.map(mapTaskRow);
}

export async function createTask(orgId: string, data: Partial<CrmTask>, userId: string): Promise<CrmTask> {
  const result = await query(
    `INSERT INTO crm_tasks (organization_id, entity_type, entity_id, title, description, type, priority, due_date, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [orgId, data.entity_type || null, data.entity_id || null, data.title, data.description || null, data.type || 'general', data.priority || 'medium', data.due_date || null, data.assigned_to || null, userId]
  );
  return mapTaskRow(result.rows[0]);
}

export async function completeTask(id: string, orgId: string): Promise<void> {
  await query("UPDATE crm_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1 AND organization_id = $2", [id, orgId]);
}

// ─── Email Templates ─────────────────────────────────────────────────────────

export async function listEmailTemplates(orgId: string, category?: string): Promise<CrmEmailTemplate[]> {
  let sql = 'SELECT * FROM crm_email_templates WHERE organization_id = $1 AND is_active = TRUE';
  const params: unknown[] = [orgId];
  if (category) { sql += ' AND category = $2'; params.push(category); }
  sql += ' ORDER BY usage_count DESC, name ASC';
  const result = await query(sql, params);
  return result.rows.map(mapEmailTemplateRow);
}

export async function createEmailTemplate(orgId: string, data: Partial<CrmEmailTemplate>, userId: string): Promise<CrmEmailTemplate> {
  const result = await query(
    `INSERT INTO crm_email_templates (organization_id, name, subject, body, category, variables, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, data.name, data.subject || null, data.body, data.category || null, JSON.stringify(data.variables || []), userId]
  );
  return mapEmailTemplateRow(result.rows[0]);
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export async function getPipelineStages(orgId: string, pipeline: string = 'default'): Promise<Array<{ id: string; name: string; position: number; probability: number; color: string }>> {
  const result = await query(
    'SELECT * FROM crm_pipeline_stages WHERE organization_id = $1 AND pipeline = $2 ORDER BY position ASC',
    [orgId, pipeline]
  );
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    position: parseInt(row.position as string),
    probability: parseInt(row.probability as string),
    color: row.color as string,
  }));
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export async function listNotes(orgId: string, entityType: string, entityId: string): Promise<Array<{ id: string; content: string; is_pinned: boolean; created_by: string | null; created_at: string }>> {
  const result = await query(
    'SELECT * FROM crm_notes WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 ORDER BY is_pinned DESC, created_at DESC',
    [orgId, entityType, entityId]
  );
  return result.rows.map(row => ({ id: row.id as string, content: row.content as string, is_pinned: row.is_pinned as boolean, created_by: row.created_by as string | null, created_at: row.created_at as string }));
}

export async function createNote(orgId: string, entityType: string, entityId: string, content: string, userId: string): Promise<void> {
  await query(
    'INSERT INTO crm_notes (organization_id, entity_type, entity_id, content, created_by) VALUES ($1, $2, $3, $4, $5)',
    [orgId, entityType, entityId, content, userId]
  );
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export async function getDashboardStats(orgId: string): Promise<Record<string, unknown>> {
  const [contacts, companies, deals, customers, tasks] = await Promise.all([
    query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads, COUNT(*) FILTER (WHERE lead_status = 'qualified') as qualified FROM crm_contacts WHERE organization_id = $1 AND deleted_at IS NULL", [orgId]),
    query("SELECT COUNT(*) as total FROM crm_companies WHERE organization_id = $1 AND deleted_at IS NULL", [orgId]),
    query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open, SUM(value_cents) FILTER (WHERE status = 'open') as pipeline_value, SUM(value_cents) FILTER (WHERE status = 'won') as won_value FROM crm_deals WHERE organization_id = $1 AND deleted_at IS NULL", [orgId]),
    query("SELECT COUNT(*) as total, AVG(health_score) as avg_health, COUNT(*) FILTER (WHERE churn_risk > 70) as at_risk FROM crm_customers WHERE organization_id = $1", [orgId]),
    query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM crm_tasks WHERE organization_id = $1", [orgId]),
  ]);

  return {
    contacts: contacts.rows[0],
    companies: companies.rows[0],
    deals: deals.rows[0],
    customers: customers.rows[0],
    tasks: tasks.rows[0],
  };
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapCompanyRow(row: Record<string, unknown>): CrmCompany {
  return {
    id: row.id as string, organization_id: row.organization_id as string, name: row.name as string,
    domain: row.domain as string | null, industry: row.industry as string | null, size: row.size as string | null,
    revenue_range: row.revenue_range as string | null, description: row.description as string | null,
    website: row.website as string | null, phone: row.phone as string | null, email: row.email as string | null,
    address: typeof row.address === 'string' ? JSON.parse(row.address) : (row.address as Record<string, unknown>) || {},
    social_links: typeof row.social_links === 'string' ? JSON.parse(row.social_links) : (row.social_links as Record<string, unknown>) || {},
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags as string[]) || [],
    custom_fields: typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : (row.custom_fields as Record<string, unknown>) || {},
    ai_summary: row.ai_summary as string | null,
    ai_insights: typeof row.ai_insights === 'string' ? JSON.parse(row.ai_insights) : (row.ai_insights as Record<string, unknown>) || {},
    status: row.status as string, created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

function mapContactRow(row: Record<string, unknown>): CrmContact {
  return {
    id: row.id as string, organization_id: row.organization_id as string, company_id: row.company_id as string | null,
    first_name: row.first_name as string, last_name: row.last_name as string,
    email: row.email as string | null, phone: row.phone as string | null,
    title: row.title as string | null, department: row.department as string | null,
    lead_score: parseInt(row.lead_score as string) || 0, lead_status: row.lead_status as string,
    lead_source: row.lead_source as string | null, owner_id: row.owner_id as string | null,
    ai_summary: row.ai_summary as string | null,
    ai_insights: typeof row.ai_insights === 'string' ? JSON.parse(row.ai_insights) : (row.ai_insights as Record<string, unknown>) || {},
    ai_next_action: row.ai_next_action as string | null,
    last_contacted_at: row.last_contacted_at as string | null, last_activity_at: row.last_activity_at as string | null,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags as string[]) || [],
    custom_fields: typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : (row.custom_fields as Record<string, unknown>) || {},
    status: row.status as string, created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

function mapDealRow(row: Record<string, unknown>): CrmDeal {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    contact_id: row.contact_id as string | null, company_id: row.company_id as string | null,
    name: row.name as string, description: row.description as string | null,
    stage: row.stage as string, value_cents: parseInt(row.value_cents as string) || 0,
    currency: row.currency as string, probability: parseInt(row.probability as string) || 0,
    expected_close_date: row.expected_close_date as string | null, actual_close_date: row.actual_close_date as string | null,
    pipeline: row.pipeline as string, win_reason: row.win_reason as string | null, loss_reason: row.loss_reason as string | null,
    products: typeof row.products === 'string' ? JSON.parse(row.products) : (row.products as unknown[]) || [],
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags as string[]) || [],
    owner_id: row.owner_id as string | null, ai_health_score: parseInt(row.ai_health_score as string) || 0,
    ai_forecast: typeof row.ai_forecast === 'string' ? JSON.parse(row.ai_forecast) : (row.ai_forecast as Record<string, unknown>) || {},
    ai_summary: row.ai_summary as string | null, status: row.status as string,
    created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

function mapCustomerRow(row: Record<string, unknown>): CrmCustomer {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    contact_id: row.contact_id as string | null, company_id: row.company_id as string | null, deal_id: row.deal_id as string | null,
    customer_type: row.customer_type as string, health_score: parseInt(row.health_score as string) || 50,
    nps_score: row.nps_score ? parseInt(row.nps_score as string) : null,
    satisfaction_score: row.satisfaction_score ? parseInt(row.satisfaction_score as string) : null,
    churn_risk: parseInt(row.churn_risk as string) || 0, onboarding_status: row.onboarding_status as string,
    onboarding_progress: parseInt(row.onboarding_progress as string) || 0,
    renewal_date: row.renewal_date as string | null,
    renewal_value_cents: parseInt(row.renewal_value_cents as string) || 0,
    lifetime_value_cents: parseInt(row.lifetime_value_cents as string) || 0,
    expansion_opportunities: typeof row.expansion_opportunities === 'string' ? JSON.parse(row.expansion_opportunities) : (row.expansion_opportunities as unknown[]) || [],
    success_plan: typeof row.success_plan === 'string' ? JSON.parse(row.success_plan) : (row.success_plan as Record<string, unknown>) || {},
    ai_health_summary: row.ai_health_summary as string | null,
    ai_retention_recommendations: typeof row.ai_retention_recommendations === 'string' ? JSON.parse(row.ai_retention_recommendations) : (row.ai_retention_recommendations as unknown[]) || [],
    status: row.status as string, created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

function mapActivityRow(row: Record<string, unknown>): CrmActivity {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    entity_type: row.entity_type as string, entity_id: row.entity_id as string,
    type: row.type as string, subject: row.subject as string | null, description: row.description as string | null,
    duration_minutes: row.duration_minutes ? parseInt(row.duration_minutes as string) : null,
    outcome: row.outcome as string | null, scheduled_at: row.scheduled_at as string | null,
    completed_at: row.completed_at as string | null, status: row.status as string,
    assigned_to: row.assigned_to as string | null, created_at: row.created_at as string,
  };
}

function mapTaskRow(row: Record<string, unknown>): CrmTask {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    entity_type: row.entity_type as string | null, entity_id: row.entity_id as string | null,
    title: row.title as string, description: row.description as string | null,
    type: row.type as string, priority: row.priority as string, status: row.status as string,
    due_date: row.due_date as string | null, completed_at: row.completed_at as string | null,
    assigned_to: row.assigned_to as string | null, created_at: row.created_at as string,
  };
}

function mapEmailTemplateRow(row: Record<string, unknown>): CrmEmailTemplate {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    name: row.name as string, subject: row.subject as string | null, body: row.body as string,
    category: row.category as string | null,
    variables: typeof row.variables === 'string' ? JSON.parse(row.variables) : (row.variables as string[]) || [],
    is_active: row.is_active as boolean, usage_count: parseInt(row.usage_count as string) || 0,
    created_at: row.created_at as string,
  };
}
