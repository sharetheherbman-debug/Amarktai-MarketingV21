import { query, transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';

interface SuggestedAction {
  action_type: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_in_days?: number;
}

function parseJson(content: string): Record<string, unknown> {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
    throw new AppError(502, 'AI provider returned invalid CRM analysis JSON', 'AI_RESPONSE_INVALID');
  }
}

function normalizeActions(value: unknown): SuggestedAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item): SuggestedAction[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const title = String(row.title || '').trim();
    if (!title) return [];
    const priority = ['low', 'medium', 'high', 'urgent'].includes(String(row.priority))
      ? String(row.priority) as SuggestedAction['priority']
      : 'medium';
    return [{
      action_type: String(row.action_type || 'follow_up').slice(0, 80),
      title: title.slice(0, 255),
      description: row.description ? String(row.description) : undefined,
      priority,
      due_in_days: Math.max(0, Math.min(Number(row.due_in_days || 1), 365)),
    }];
  });
}

async function ask(orgId: string, prompt: string): Promise<Record<string, unknown>> {
  const result = await providerRouter.routeRequest(
    [
      { role: 'system', content: 'You are a CRM analyst. Return only strict JSON matching the requested schema. Base recommendations only on the supplied facts.' },
      { role: 'user', content: prompt },
    ],
    'gpt-4o-mini',
    { max_tokens: 1800, temperature: 0.2 },
    { organizationId: orgId }
  );
  return parseJson(result.content);
}

async function replaceActions(
  orgId: string,
  entityType: string,
  entityId: string,
  actions: SuggestedAction[],
  userId?: string
): Promise<Record<string, unknown>[]> {
  return transaction(async (client) => {
    await client.query(
      "UPDATE crm_ai_actions SET status = 'dismissed', updated_at = NOW() WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'open'",
      [orgId, entityType, entityId]
    );
    const rows: Record<string, unknown>[] = [];
    for (const action of actions) {
      const dueAt = new Date(Date.now() + (action.due_in_days || 1) * 86400000);
      const result = await client.query(
        `INSERT INTO crm_ai_actions
           (organization_id, entity_type, entity_id, action_type, title, description, priority, due_at, metadata, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [orgId, entityType, entityId, action.action_type, action.title, action.description || null, action.priority || 'medium', dueAt, JSON.stringify({ ai_generated: true }), userId || null]
      );
      rows.push(result.rows[0]);
    }
    return rows;
  });
}

export async function analyzeContact(contactId: string, orgId: string, userId?: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT c.*, co.name AS company_name,
       (SELECT COUNT(*) FROM crm_activities a WHERE a.organization_id = c.organization_id AND a.entity_type = 'contact' AND a.entity_id = c.id) AS activity_count,
       (SELECT COUNT(*) FROM crm_deals d WHERE d.organization_id = c.organization_id AND d.contact_id = c.id AND d.status = 'open') AS open_deals,
       (SELECT COALESCE(SUM(value_cents),0) FROM crm_deals d WHERE d.organization_id = c.organization_id AND d.contact_id = c.id AND d.status = 'open') AS pipeline_value
     FROM crm_contacts c
     LEFT JOIN crm_companies co ON co.id = c.company_id
     WHERE c.id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
    [contactId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Contact');
  const contact = result.rows[0];
  const analysis = await ask(orgId, `Analyze this lead and return JSON:\n{"score":0,"factors":[""],"summary":"","next_action":"","actions":[{"action_type":"follow_up","title":"","description":"","priority":"high","due_in_days":1}]}\n\nFacts:\n${JSON.stringify(contact, null, 2)}`);
  const score = Math.max(0, Math.min(Number(analysis.score || 0), 100));
  const actions = normalizeActions(analysis.actions);
  const persistedActions = await replaceActions(orgId, 'contact', contactId, actions, userId);
  await query(
    `UPDATE crm_contacts SET lead_score = $1, ai_next_action = $2, ai_summary = $3, ai_insights = $4, updated_at = NOW()
     WHERE id = $5 AND organization_id = $6`,
    [score, String(analysis.next_action || actions[0]?.title || ''), String(analysis.summary || ''), JSON.stringify({ factors: analysis.factors || [] }), contactId, orgId]
  );
  return { score, factors: analysis.factors || [], summary: analysis.summary || '', next_action: analysis.next_action || actions[0]?.title || '', actions: persistedActions };
}

export async function analyzeDeal(dealId: string, orgId: string, userId?: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT d.*,
       (SELECT COUNT(*) FROM crm_activities a WHERE a.organization_id = d.organization_id AND a.entity_type = 'deal' AND a.entity_id = d.id) AS activity_count,
       EXTRACT(DAY FROM NOW() - d.created_at)::int AS days_open
     FROM crm_deals d WHERE d.id = $1 AND d.organization_id = $2 AND d.deleted_at IS NULL`,
    [dealId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Deal');
  const deal = result.rows[0];
  const analysis = await ask(orgId, `Analyze this sales deal and return JSON:\n{"health_score":0,"forecast":{"win_probability":0,"expected_value_cents":0,"risk_factors":[""]},"summary":"","actions":[{"action_type":"deal_follow_up","title":"","description":"","priority":"high","due_in_days":1}]}\n\nFacts:\n${JSON.stringify(deal, null, 2)}`);
  const healthScore = Math.max(0, Math.min(Number(analysis.health_score || 0), 100));
  const actions = await replaceActions(orgId, 'deal', dealId, normalizeActions(analysis.actions), userId);
  await query(
    `UPDATE crm_deals SET ai_health_score = $1, ai_forecast = $2, ai_summary = $3, updated_at = NOW()
     WHERE id = $4 AND organization_id = $5`,
    [healthScore, JSON.stringify(analysis.forecast || {}), String(analysis.summary || ''), dealId, orgId]
  );
  return { health_score: healthScore, forecast: analysis.forecast || {}, summary: analysis.summary || '', actions };
}

export async function analyzeCustomer(customerId: string, orgId: string, userId?: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT c.*, co.name AS company_name, ct.first_name, ct.last_name
     FROM crm_customers c
     LEFT JOIN crm_companies co ON co.id = c.company_id
     LEFT JOIN crm_contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.organization_id = $2`,
    [customerId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Customer');
  const customer = result.rows[0];
  const analysis = await ask(orgId, `Analyze customer health and return JSON:\n{"health_score":0,"churn_risk":0,"summary":"","recommendations":[""],"actions":[{"action_type":"retention","title":"","description":"","priority":"high","due_in_days":1}]}\n\nFacts:\n${JSON.stringify(customer, null, 2)}`);
  const healthScore = Math.max(0, Math.min(Number(analysis.health_score || 0), 100));
  const churnRisk = Math.max(0, Math.min(Number(analysis.churn_risk || 0), 100));
  const actions = await replaceActions(orgId, 'customer', customerId, normalizeActions(analysis.actions), userId);
  await query(
    `UPDATE crm_customers SET health_score = $1, churn_risk = $2, ai_retention_recommendations = $3, ai_health_summary = $4, updated_at = NOW()
     WHERE id = $5 AND organization_id = $6`,
    [healthScore, churnRisk, JSON.stringify(analysis.recommendations || []), String(analysis.summary || ''), customerId, orgId]
  );
  return { health_score: healthScore, churn_risk: churnRisk, recommendations: analysis.recommendations || [], summary: analysis.summary || '', actions };
}

export async function listActions(orgId: string, status = 'open', limit = 100): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT a.*,
       CASE
         WHEN a.entity_type = 'contact' THEN (SELECT CONCAT(first_name, ' ', last_name) FROM crm_contacts WHERE id = a.entity_id)
         WHEN a.entity_type = 'deal' THEN (SELECT name FROM crm_deals WHERE id = a.entity_id)
         WHEN a.entity_type = 'customer' THEN 'Customer account'
         ELSE a.entity_type
       END AS entity_name
     FROM crm_ai_actions a
     WHERE a.organization_id = $1 AND ($2 = 'all' OR a.status = $2)
     ORDER BY CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, a.due_at ASC NULLS LAST, a.created_at DESC
     LIMIT $3`,
    [orgId, status, Math.max(1, Math.min(limit, 500))]
  );
  return result.rows;
}

export async function updateActionStatus(id: string, orgId: string, status: 'completed' | 'dismissed', userId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `UPDATE crm_ai_actions
     SET status = $1, completed_by = $2, completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END, updated_at = NOW()
     WHERE id = $3 AND organization_id = $4 AND status = 'open'
     RETURNING *`,
    [status, userId, id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('CRM AI action');
  return result.rows[0];
}
