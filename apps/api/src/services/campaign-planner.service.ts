import crypto from 'crypto';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { contextEngine } from './context-engine.service';
import { generateGovernedText } from './governed-text-generation.service';

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
  brief: Record<string, unknown>;
  creative_concept: Record<string, unknown>;
  messaging_plan: Record<string, unknown>;
  asset_requirements: Array<Record<string, unknown>>;
  optimization_plan: Record<string, unknown>;
  constraints: Record<string, unknown>;
  generation_credit_limit: number;
  version: number;
  approved_at: string | null;
  approved_by: string | null;
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
  objective_stage?: 'awareness' | 'consideration' | 'conversion' | 'retention' | 'reactivation';
  offer?: string;
  value_proposition?: string;
  proof_points?: string[];
  calls_to_action?: string[];
  channels?: string[];
  brand_restrictions?: string[];
  prohibited_claims?: string[];
  success_criteria?: string[];
  generation_credit_limit?: number;
  language?: string;
  idempotency_key?: string;
}

export interface CampaignPlanUpdate {
  name?: string;
  goal?: string;
  brief?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  creative_concept?: Record<string, unknown>;
  messaging_plan?: Record<string, unknown>;
  channels?: Record<string, unknown>;
  kpis?: Record<string, unknown>;
  content_calendar?: CalendarEntry[];
  asset_requirements?: Array<Record<string, unknown>>;
  optimization_plan?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  generation_credit_limit?: number;
  change_summary?: string;
}

const REQUIRED_PLAN_KEYS = [
  'brief', 'strategy', 'creative_concept', 'messaging_plan', 'channels',
  'content_calendar', 'asset_requirements', 'kpis', 'optimization_plan', 'constraints',
] as const;

function parseGeneratedPlan(content: string): Record<string, any> {
  const unfenced = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AppError(502, 'GenX did not return a campaign plan', 'PLAN_OUTPUT_INVALID');
  let parsed: Record<string, any>;
  try { parsed = JSON.parse(unfenced.slice(start, end + 1)); }
  catch { throw new AppError(502, 'GenX returned invalid campaign-plan JSON', 'PLAN_OUTPUT_INVALID'); }
  const missing = REQUIRED_PLAN_KEYS.filter((key) => parsed[key] === undefined);
  if (missing.length > 0) {
    throw new AppError(502, `Campaign plan is missing: ${missing.join(', ')}`, 'PLAN_OUTPUT_INCOMPLETE');
  }
  if (!Array.isArray(parsed.content_calendar) || !Array.isArray(parsed.asset_requirements)) {
    throw new AppError(502, 'Campaign calendar and asset requirements must be lists', 'PLAN_OUTPUT_INVALID');
  }
  return parsed;
}

function planSnapshot(plan: CampaignPlan): Record<string, unknown> {
  const { id, organization_id, created_at, updated_at, ...snapshot } = plan;
  return snapshot;
}

async function savePlanVersion(plan: CampaignPlan, userId: string, summary: string): Promise<void> {
  await query(
    `INSERT INTO campaign_plan_versions
       (campaign_plan_id,organization_id,version,snapshot,change_summary,created_by)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (campaign_plan_id,version) DO NOTHING`,
    [plan.id, plan.organization_id, plan.version, JSON.stringify(planSnapshot(plan)), summary, userId]
  );
}

// ─── Campaign Planner ────────────────────────────────────────────────────────

export async function generatePlan(orgId: string, input: CampaignPlanInput, userId: string): Promise<CampaignPlan> {
  const context = await contextEngine.assemble({
    orgId,
    agentId: '',
    includeBrandDna: true,
    includeKnowledge: true,
  });

  const factualInputs = {
    campaign_name: input.name,
    goal: input.goal,
    objective_stage: input.objective_stage || 'conversion',
    target_audience: input.target_audience,
    budget_gbp: Number((input.budget_cents / 100).toFixed(2)),
    products_or_services: input.products,
    location: input.location,
    duration_weeks: input.duration_weeks || 4,
    offer: input.offer || '',
    value_proposition: input.value_proposition || '',
    proof_points: input.proof_points || [],
    calls_to_action: input.calls_to_action || [],
    requested_channels: input.channels || [],
    brand_restrictions: input.brand_restrictions || [],
    prohibited_claims: input.prohibited_claims || [],
    success_criteria: input.success_criteria || [],
    generation_credit_limit: input.generation_credit_limit || 0,
    language: input.language || 'en-GB',
  };

  const prompt = `You are EquiProfile Marketing's senior campaign strategist and creative director.

Create one coherent, professional, multi-channel campaign. Treat FACTUAL INPUTS and BRAND CONTEXT as the only source of business facts. Never invent statistics, testimonials, certifications, guarantees, prices, product capabilities or proof. Put any essential missing facts in constraints.missing_information and write copy that does not depend on them.

FACTUAL INPUTS:
${JSON.stringify(factualInputs, null, 2)}

${context.brandDna ? `BRAND CONTEXT:\n${context.brandDna.substring(0, 4000)}` : 'BRAND CONTEXT: Not configured. Use a neutral professional voice and flag this limitation.'}
${context.knowledge ? `APPROVED BUSINESS KNOWLEDGE:\n${context.knowledge.substring(0, 4000)}` : 'APPROVED BUSINESS KNOWLEDGE: Not configured.'}

Adapt each asset to its platform rather than duplicating identical copy. Connect the campaign idea, audience needs, objections, offer, proof, call to action, schedule and measurement plan. The strategy must be editable and approved before asset generation.

Return strict JSON only with this shape:
{
  "brief": {"objective_stage":"conversion","objective":"","success_criteria":[],"audience_segments":[{"name":"","needs":[],"objections":[],"motivations":[]}],"offer":"","value_proposition":"","proof_points":[],"calls_to_action":[],"language":"en-GB"},
  "strategy": {"overview":"","positioning":"","journey":[],"key_messages":[],"channel_rationale":{}},
  "creative_concept": {"name":"","central_idea":"","hook":"","narrative":"","visual_direction":"","voice_direction":""},
  "messaging_plan": {"primary_message":"","supporting_messages":[],"objection_responses":[],"cta_hierarchy":[]},
  "channels": {"social":{},"email":{},"content":{},"seo":{},"advertising":{}},
  "content_calendar": [{"date":"YYYY-MM-DD","platform":"","content_type":"","topic":"","status":"planned","brief_id":""}],
  "asset_requirements": [{"brief_id":"","platform":"","format":"","purpose":"","hook":"","message":"","cta":"","dimensions_or_length":"","accessibility_requirements":[],"variations":2}],
  "kpis": {"primary":[],"secondary":[],"tracking_requirements":[]},
  "optimization_plan": {"signals":[],"recommendation_rules":[],"owner_approval_required":true},
  "constraints": {"brand_restrictions":[],"prohibited_claims":[],"missing_information":[],"owner_checks":[]}
}`;

  try {
    const result = await generateGovernedText({
      organizationId: orgId,
      userId,
      idempotencyKey: input.idempotency_key || `campaign-plan:${crypto.randomUUID()}`,
      title: `Generate campaign strategy: ${input.name}`,
      summary: 'Create an editable campaign strategy and asset plan',
      prompt,
      maxTokens: 6000,
      temperature: 0.7,
      payload: { campaign_name: input.name, objective_stage: factualInputs.objective_stage },
    });

    const parsed = parseGeneratedPlan(result.content);

    const dbResult = await query(
      `INSERT INTO campaign_plans
         (organization_id,name,goal,target_audience,budget_cents,brief,strategy,
          creative_concept,messaging_plan,channels,kpis,content_calendar,
          asset_requirements,optimization_plan,constraints,generation_credit_limit,
          status,ai_generated,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft',TRUE,$17)
       RETURNING *`,
      [
        orgId, input.name, input.goal,
        JSON.stringify({ description: input.target_audience }),
        input.budget_cents,
        JSON.stringify(parsed.brief), JSON.stringify(parsed.strategy),
        JSON.stringify(parsed.creative_concept), JSON.stringify(parsed.messaging_plan),
        JSON.stringify(parsed.channels), JSON.stringify(parsed.kpis),
        JSON.stringify(parsed.content_calendar), JSON.stringify(parsed.asset_requirements),
        JSON.stringify(parsed.optimization_plan), JSON.stringify(parsed.constraints),
        input.generation_credit_limit || 0,
        userId,
      ]
    );

    logger.info(`Campaign plan generated: ${input.name} for org: ${orgId}`);
    const plan = mapPlanRow(dbResult.rows[0]);
    await savePlanVersion(plan, userId, 'AI-generated campaign strategy');
    return plan;
  } catch (error) {
    if (error instanceof AppError) throw error;
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

export async function updatePlanStatus(id: string, orgId: string, status: string, userId: string): Promise<void> {
  if (!['draft', 'review', 'approved', 'archived'].includes(status)) {
    throw new AppError(400, 'Campaign plan status is invalid', 'PLAN_STATUS_INVALID');
  }
  if (status === 'approved') {
    const readiness = await query(
      `SELECT plan.constraints,plan.creative_concept,plan.asset_requirements,member.role
       FROM campaign_plans plan
       JOIN organization_members member ON member.organization_id=plan.organization_id AND member.user_id=$3
       WHERE plan.id=$1 AND plan.organization_id=$2`,
      [id, orgId, userId]
    );
    if (readiness.rows.length === 0 || !['owner', 'admin'].includes(String(readiness.rows[0].role))) {
      throw new AppError(403, 'Only the owner may approve campaign strategy', 'PLAN_APPROVAL_FORBIDDEN');
    }
    const constraints = typeof readiness.rows[0].constraints === 'string'
      ? JSON.parse(readiness.rows[0].constraints) : readiness.rows[0].constraints || {};
    const concept = typeof readiness.rows[0].creative_concept === 'string'
      ? JSON.parse(readiness.rows[0].creative_concept) : readiness.rows[0].creative_concept || {};
    const assets = typeof readiness.rows[0].asset_requirements === 'string'
      ? JSON.parse(readiness.rows[0].asset_requirements) : readiness.rows[0].asset_requirements || [];
    if (Array.isArray(constraints.missing_information) && constraints.missing_information.length > 0) {
      throw new AppError(409, 'Resolve missing campaign information before approval', 'PLAN_INFORMATION_REQUIRED');
    }
    if (!String(concept.central_idea || '').trim() || !Array.isArray(assets) || assets.length === 0) {
      throw new AppError(409, 'Campaign strategy requires a creative concept and asset plan', 'PLAN_INCOMPLETE');
    }
  }
  await query(
    `UPDATE campaign_plans SET status=$1,
       approved_at=CASE WHEN $1='approved' THEN NOW() ELSE approved_at END,
       approved_by=CASE WHEN $1='approved' THEN $4 ELSE approved_by END,
       updated_at=NOW() WHERE id=$2 AND organization_id=$3`,
    [status, id, orgId, userId]
  );
}

export async function updatePlan(
  id: string,
  orgId: string,
  input: CampaignPlanUpdate,
  userId: string
): Promise<CampaignPlan> {
  const fields: Array<[keyof CampaignPlanUpdate, string, boolean]> = [
    ['name', 'name', false], ['goal', 'goal', false], ['brief', 'brief', true],
    ['strategy', 'strategy', true], ['creative_concept', 'creative_concept', true],
    ['messaging_plan', 'messaging_plan', true], ['channels', 'channels', true],
    ['kpis', 'kpis', true], ['content_calendar', 'content_calendar', true],
    ['asset_requirements', 'asset_requirements', true], ['optimization_plan', 'optimization_plan', true],
    ['constraints', 'constraints', true], ['generation_credit_limit', 'generation_credit_limit', false],
  ];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, column, json] of fields) {
    if (input[key] === undefined) continue;
    if (key === 'generation_credit_limit' && (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0)) {
      throw new AppError(400, 'generation_credit_limit must be a non-negative integer', 'PLAN_INVALID');
    }
    values.push(json ? JSON.stringify(input[key]) : input[key]);
    updates.push(`${column}=$${values.length}`);
  }
  if (updates.length === 0) return getPlanById(id, orgId);
  values.push(id, orgId);
  const result = await query(
    `UPDATE campaign_plans SET ${updates.join(',')},version=version+1,status='draft',
       approved_at=NULL,approved_by=NULL,updated_at=NOW()
     WHERE id=$${values.length - 1} AND organization_id=$${values.length} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new NotFoundError('Campaign plan');
  const plan = mapPlanRow(result.rows[0]);
  await savePlanVersion(plan, userId, input.change_summary || 'Campaign strategy edited');
  return plan;
}

export async function listPlanVersions(id: string, orgId: string): Promise<Record<string, unknown>[]> {
  await getPlanById(id, orgId);
  return (await query(
    `SELECT id,version,change_summary,created_by,created_at
     FROM campaign_plan_versions WHERE campaign_plan_id=$1 AND organization_id=$2
     ORDER BY version DESC`,
    [id, orgId]
  )).rows;
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
    brief: typeof row.brief === 'string' ? JSON.parse(row.brief) : (row.brief as Record<string, unknown>) || {},
    creative_concept: typeof row.creative_concept === 'string' ? JSON.parse(row.creative_concept) : (row.creative_concept as Record<string, unknown>) || {},
    messaging_plan: typeof row.messaging_plan === 'string' ? JSON.parse(row.messaging_plan) : (row.messaging_plan as Record<string, unknown>) || {},
    asset_requirements: typeof row.asset_requirements === 'string' ? JSON.parse(row.asset_requirements) : (row.asset_requirements as Array<Record<string, unknown>>) || [],
    optimization_plan: typeof row.optimization_plan === 'string' ? JSON.parse(row.optimization_plan) : (row.optimization_plan as Record<string, unknown>) || {},
    constraints: typeof row.constraints === 'string' ? JSON.parse(row.constraints) : (row.constraints as Record<string, unknown>) || {},
    generation_credit_limit: Number(row.generation_credit_limit || 0),
    version: Number(row.version || 1),
    approved_at: row.approved_at as string | null,
    approved_by: row.approved_by as string | null,
    status: row.status as string,
    ai_generated: row.ai_generated as boolean,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
