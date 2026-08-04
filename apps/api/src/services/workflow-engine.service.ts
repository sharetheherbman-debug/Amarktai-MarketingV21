import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  status: string;
  is_template: boolean;
  template_category: string | null;
  run_count: number;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  id: string;
  type: 'trigger' | 'condition' | 'ai_decision' | 'content_generation' | 'approval' | 'publish' | 'notification' | 'delay' | 'action';
  name: string;
  config: Record<string, unknown>;
  next_step_id?: string;
  error_step_id?: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  organization_id: string;
  status: string;
  current_step: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface CreateWorkflowData {
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  steps: WorkflowStep[];
  is_template?: boolean;
  template_category?: string;
}

// ─── Workflow CRUD ───────────────────────────────────────────────────────────

export async function list(orgId: string, category?: string): Promise<Workflow[]> {
  let sql = 'SELECT * FROM workflows_v2 WHERE organization_id = $1';
  const params: unknown[] = [orgId];

  if (category) {
    sql += ' AND template_category = $2';
    params.push(category);
  }

  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function getById(id: string, orgId: string): Promise<Workflow> {
  const result = await query('SELECT * FROM workflows_v2 WHERE id = $1 AND organization_id = $2', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Workflow');
  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateWorkflowData, userId: string): Promise<Workflow> {
  const result = await query(
    `INSERT INTO workflows_v2 (organization_id, name, description, trigger_type, trigger_config, steps, is_template, template_category, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [orgId, data.name, data.description || null, data.trigger_type, JSON.stringify(data.trigger_config || {}), JSON.stringify(data.steps), data.is_template || false, data.template_category || null, userId]
  );
  logger.info(`Workflow created: ${data.name}`);
  return mapRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: Partial<CreateWorkflowData>): Promise<Workflow> {
  const existing = await getById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.steps !== undefined) { updates.push(`steps = $${idx++}`); values.push(JSON.stringify(data.steps)); }
  if (data.trigger_type !== undefined) { updates.push(`trigger_type = $${idx++}`); values.push(data.trigger_type); }

  if (updates.length === 0) return existing;
  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE workflows_v2 SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
    values
  );
  return mapRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM workflows_v2 WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Workflow');
}

// ─── Workflow Execution ──────────────────────────────────────────────────────

export async function execute(workflowId: string, orgId: string, input: Record<string, unknown>, userId: string): Promise<WorkflowExecution> {
  const workflow = await getById(workflowId, orgId);

  const result = await query(
    `INSERT INTO workflow_executions (workflow_id, organization_id, input, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [workflowId, orgId, JSON.stringify(input), userId]
  );

  // Update run count
  await query('UPDATE workflows_v2 SET run_count = run_count + 1, last_run_at = NOW() WHERE id = $1', [workflowId]);

  logger.info(`Workflow ${workflowId} execution started`);
  return mapExecutionRow(result.rows[0]);
}

export async function getExecutions(workflowId: string, orgId: string): Promise<WorkflowExecution[]> {
  const result = await query(
    'SELECT * FROM workflow_executions WHERE workflow_id = $1 AND organization_id = $2 ORDER BY started_at DESC',
    [workflowId, orgId]
  );
  return result.rows.map(mapExecutionRow);
}

export async function listTemplates(orgId: string): Promise<Workflow[]> {
  const result = await query(
    "SELECT * FROM workflows_v2 WHERE organization_id = $1 AND is_template = TRUE ORDER BY template_category, name",
    [orgId]
  );
  return result.rows.map(mapRow);
}

// ─── Default Templates ───────────────────────────────────────────────────────

export async function seedDefaultTemplates(orgId: string, userId: string): Promise<void> {
  const templates = [
    {
      name: 'Content Approval Workflow',
      description: 'Standard content approval with AI review',
      category: 'content',
      steps: [
        { id: '1', type: 'trigger' as const, name: 'Content Created', config: { event: 'content.created' } },
        { id: '2', type: 'ai_decision' as const, name: 'AI Quality Check', config: { checks: ['grammar', 'brand_voice', 'seo'] } },
        { id: '3', type: 'condition' as const, name: 'Quality Pass?', config: { field: 'quality_score', operator: 'gte', value: 70 }, next_step_id: '4', error_step_id: '6' },
        { id: '4', type: 'approval' as const, name: 'Human Review', config: { assign_to: 'manager' } },
        { id: '5', type: 'publish' as const, name: 'Publish', config: {} },
        { id: '6', type: 'notification' as const, name: 'Request Changes', config: { message: 'Content needs revision' } },
      ],
    },
    {
      name: 'Social Media Campaign',
      description: 'Multi-platform social publishing workflow',
      category: 'social',
      steps: [
        { id: '1', type: 'trigger' as const, name: 'Campaign Activated', config: { event: 'campaign.activated' } },
        { id: '2', type: 'content_generation' as const, name: 'Generate Posts', config: { platforms: ['instagram', 'linkedin', 'x'] } },
        { id: '3', type: 'approval' as const, name: 'Review Posts', config: {} },
        { id: '4', type: 'publish' as const, name: 'Schedule Posts', config: { stagger_minutes: 30 } },
        { id: '5', type: 'delay' as const, name: 'Wait 24h', config: { hours: 24 } },
        { id: '6', type: 'action' as const, name: 'Collect Analytics', config: { action: 'collect_engagement' } },
      ],
    },
    {
      name: 'SEO Content Pipeline',
      description: 'Research, create, optimize, publish',
      category: 'seo',
      steps: [
        { id: '1', type: 'trigger' as const, name: 'Keyword Added', config: { event: 'seo.keyword_added' } },
        { id: '2', type: 'ai_decision' as const, name: 'Analyze Intent', config: { analyze: 'search_intent' } },
        { id: '3', type: 'content_generation' as const, name: 'Generate Content', config: { use_brand_dna: true, use_knowledge: true } },
        { id: '4', type: 'action' as const, name: 'SEO Optimization', config: { optimize_for: 'target_keywords' } },
        { id: '5', type: 'approval' as const, name: 'Editor Review', config: {} },
        { id: '6', type: 'publish' as const, name: 'Publish', config: {} },
      ],
    },
  ];

  for (const t of templates) {
    await create(orgId, {
      name: t.name,
      description: t.description,
      trigger_type: 'event',
      steps: t.steps,
      is_template: true,
      template_category: t.category,
    }, userId);
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Workflow {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    description: row.description as string | null,
    trigger_type: row.trigger_type as string,
    trigger_config: typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : (row.trigger_config as Record<string, unknown>) || {},
    steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps as WorkflowStep[]) || [],
    status: row.status as string,
    is_template: row.is_template as boolean,
    template_category: row.template_category as string | null,
    run_count: parseInt(row.run_count as string) || 0,
    last_run_at: row.last_run_at as string | null,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapExecutionRow(row: Record<string, unknown>): WorkflowExecution {
  return {
    id: row.id as string,
    workflow_id: row.workflow_id as string,
    organization_id: row.organization_id as string,
    status: row.status as string,
    current_step: parseInt(row.current_step as string) || 0,
    input: typeof row.input === 'string' ? JSON.parse(row.input) : (row.input as Record<string, unknown>) || {},
    output: typeof row.output === 'string' ? JSON.parse(row.output) : (row.output as Record<string, unknown>) || {},
    error: row.error as string | null,
    started_at: row.started_at as string,
    completed_at: row.completed_at as string | null,
  };
}
