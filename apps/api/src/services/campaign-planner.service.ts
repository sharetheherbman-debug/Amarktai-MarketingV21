import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import { contextEngine } from './context-engine.service';
import * as brandDnaService from './brand-dna.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CampaignPlan {
  id: string;
  organization_id: string;
  name: string;
  goal: string | null;
  target_audience: Record<string, unknown>;
  budget_cents: number;
  strategy: Record<string, unknown>;
  channels: Record<string, unknown>;
  kpis: Record<string, unknown>;
  content_calendar: CalendarEntry[];
  status: string;
  ai_generated: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEntry {
  date: string;
  platform: string;
  content_type: string;
  topic: string;
  status: string;
}

export interface CampaignPlanInput {
  name: string;
  goal: string;
  target_audience: string;
  budget_cents: number;
  products: string;
  location: string;
  duration_weeks?: number;
}

// ─── Campaign Planner ────────────────────────────────────────────────────────

export async function generatePlan(orgId: string, input: CampaignPlanInput, userId: string): Promise<CampaignPlan> {
  const context = await contextEngine.assemble({
    orgId,
    agentId: '',
    includeBrandDna: true,
    includeKnowledge: true,
  });

  const prompt = `Create a comprehensive multi-channel marketing campaign plan.

Campaign: ${input.name}
Goal: ${input.goal}
Target Audience: ${input.target_audience}
Budget: $${(input.budget_cents / 100).toFixed(2)}
Products/Services: ${input.products}
Location: ${input.location}
Duration: ${input.duration_weeks || 4} weeks

${context.brandDna ? `Brand Context:\n${context.brandDna.substring(0, 1000)}` : ''}

Create a detailed plan with:
1. Strategy overview
2. Channel breakdown (SEO, Social, Email, Content, Advertising)
3. Content calendar (weekly entries with platform, type, topic)
4. KPIs and targets
5. Budget allocation

Return as JSON:
{
  "strategy": {"overview":"...","key_messages":["..."],"positioning":"..."},
  "channels": {
    "seo": {"focus":"...","keywords":["..."],"actions":["..."]},
    "social": {"platforms":["..."],"posting_frequency":"...","content_types":["..."]},
    "email": {"sequences":["..."],"frequency":"...","segments":["..."]},
    "content": {"types":["..."],"topics":["..."],"frequency":"..."},
    "advertising": {"platforms":["..."],"budget_allocation":"...","targeting":"..."}
  },
  "content_calendar": [{"date":"2024-01-15","platform":"instagram","content_type":"post","topic":"...","status":"planned"}],
  "kpis": {"reach":0,"engagement_rate":0,"conversions":0,"roi":0}
}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o',
      { max_tokens: 6000, temperature: 0.7 },
      { organizationId: orgId }
    );

    const parsed = JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));

    const dbResult = await query(
      `INSERT INTO campaign_plans (organization_id, name, goal, target_audience, budget_cents, strategy, channels, kpis, content_calendar, status, ai_generated, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', TRUE, $10) RETURNING *`,
      [
        orgId, input.name, input.goal,
        JSON.stringify({ description: input.target_audience }),
        input.budget_cents,
        JSON.stringify(parsed.strategy || {}),
        JSON.stringify(parsed.channels || {}),
        JSON.stringify(parsed.kpis || {}),
        JSON.stringify(parsed.content_calendar || []),
        userId,
      ]
    );

    logger.info(`Campaign plan generated: ${input.name} for org: ${orgId}`);
    return mapPlanRow(dbResult.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plan generation failed';
    throw new AppError(500, `Campaign plan generation failed: ${message}`, 'PLAN_ERROR');
  }
}

export async function listPlans(orgId: string): Promise<CampaignPlan[]> {
  const result = await query(
    'SELECT * FROM campaign_plans WHERE organization_id = $1 ORDER BY created_at DESC',
    [orgId]
  );
  return result.rows.map(mapPlanRow);
}

export async function getPlanById(id: string, orgId: string): Promise<CampaignPlan> {
  const result = await query(
    'SELECT * FROM campaign_plans WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Campaign plan');
  return mapPlanRow(result.rows[0]);
}

export async function updatePlanStatus(id: string, orgId: string, status: string): Promise<void> {
  await query(
    'UPDATE campaign_plans SET status = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
    [status, id, orgId]
  );
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapPlanRow(row: Record<string, unknown>): CampaignPlan {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    goal: row.goal as string | null,
    target_audience: typeof row.target_audience === 'string' ? JSON.parse(row.target_audience) : (row.target_audience as Record<string, unknown>) || {},
    budget_cents: parseInt(row.budget_cents as string) || 0,
    strategy: typeof row.strategy === 'string' ? JSON.parse(row.strategy) : (row.strategy as Record<string, unknown>) || {},
    channels: typeof row.channels === 'string' ? JSON.parse(row.channels) : (row.channels as Record<string, unknown>) || {},
    kpis: typeof row.kpis === 'string' ? JSON.parse(row.kpis) : (row.kpis as Record<string, unknown>) || {},
    content_calendar: typeof row.content_calendar === 'string' ? JSON.parse(row.content_calendar) : (row.content_calendar as CalendarEntry[]) || [],
    status: row.status as string,
    ai_generated: row.ai_generated as boolean,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
