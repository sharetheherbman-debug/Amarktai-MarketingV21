import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { agentOrchestrator } from '../services/agent-orchestrator.service';
import { taskPlanner } from '../services/task-planner.service';
import { toolService } from '../services/tool.service';
import { ApiResponse } from '../types';
import { ensureMarketingWorkforce } from '../services/marketing-workforce.service';

const router = Router();
router.use(requireAuth);

function orgId(req: AuthRequest): string {
  return String(req.body?.organization_id || req.query.organization_id || '');
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return (value as T) ?? fallback;
}

function mapAgent(row: Record<string, unknown>): Record<string, unknown> {
  const capabilities = jsonValue(row.capabilities, [] as string[]);
  const tools = jsonValue(row.tools, [] as string[]);
  return {
    ...row,
    slug: row.slug || String(row.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    systemPrompt: row.system_prompt || '',
    capabilities,
    tools,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at || null,
  };
}

// Static routes must be declared before /:id.
router.get('/tools', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    if (!organizationId) throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    await ensureMarketingWorkforce(organizationId);
    const tools = await toolService.list(organizationId, req.query.category as string);
    res.json({ success: true, data: tools });
  } catch (error) { next(error); }
});

router.get('/conversations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    if (!organizationId) throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    const conversations = await agentOrchestrator.listConversations(organizationId, req.query.agent_id as string, parseInt(req.query.limit as string) || 20);
    res.json({ success: true, data: conversations });
  } catch (error) { next(error); }
});

router.get('/conversations/:conversationId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    if (!organizationId) throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    res.json({ success: true, data: await agentOrchestrator.getConversation(req.params.conversationId, organizationId) });
  } catch (error) { next(error); }
});

router.delete('/conversations/:conversationId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    if (!organizationId) throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    await agentOrchestrator.deleteConversation(req.params.conversationId, organizationId);
    res.json({ success: true, data: { message: 'Conversation deleted' } });
  } catch (error) { next(error); }
});

const createPlanSchema = z.object({ goal: z.string().min(1), organization_id: z.string().uuid(), context: z.record(z.unknown()).optional(), max_tasks: z.number().int().min(1).max(20).optional() });
router.post('/plan', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const input = createPlanSchema.parse(req.body);
    const plan = await taskPlanner.createPlan({ orgId: input.organization_id, userId: req.user!.userId, goal: input.goal, context: input.context, maxTasks: input.max_tasks });
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.post('/plan/execute', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    if (!organizationId || !req.body.plan) throw new AppError(400, 'organization_id and plan are required', 'BAD_REQUEST');
    const taskIds = await taskPlanner.executePlan(req.body.plan, organizationId, req.user!.userId);
    res.status(201).json({ success: true, data: { plan_id: req.body.plan.id, task_ids: taskIds, tasks_created: taskIds.length } });
  } catch (error) { next(error); }
});

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    if (!organizationId) throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    await ensureMarketingWorkforce(organizationId);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 100));
    const offset = (page - 1) * limit;
    const params: unknown[] = [organizationId];
    let where = 'WHERE organization_id = $1 AND deleted_at IS NULL';
    if (req.query.type) { params.push(req.query.type); where += ` AND type = $${params.length}`; }
    if (req.query.search) { params.push(`%${req.query.search}%`); where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    const count = await query(`SELECT COUNT(*) FROM agents ${where}`, params);
    params.push(limit, offset);
    const result = await query(`SELECT * FROM agents ${where} ORDER BY updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = Number(count.rows[0].count);
    res.json({ success: true, data: result.rows.map(mapAgent), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    const { name, description, type = 'worker', config = {}, model, provider, capabilities = [], tools = [], status = 'active' } = req.body;
    const systemPrompt = req.body.system_prompt ?? req.body.systemPrompt ?? '';
    if (!organizationId || !name) throw new AppError(400, 'organization_id and name are required', 'BAD_REQUEST');
    const result = await query(
      `INSERT INTO agents (organization_id, name, description, type, config, system_prompt, model, provider, capabilities, tools, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [organizationId, name, description || null, type, JSON.stringify(config), systemPrompt || null, model || null, provider || null, JSON.stringify(capabilities), JSON.stringify(tools), status, req.user!.userId]
    );
    res.status(201).json({ success: true, data: mapAgent(result.rows[0]) });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    const result = await query('SELECT * FROM agents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [req.params.id, organizationId]);
    if (result.rows.length === 0) throw new NotFoundError('Agent');
    res.json({ success: true, data: mapAgent(result.rows[0]) });
  } catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    const fields: Array<[string, unknown]> = [
      ['name', req.body.name],
      ['description', req.body.description],
      ['type', req.body.type],
      ['config', req.body.config !== undefined ? JSON.stringify(req.body.config) : undefined],
      ['system_prompt', req.body.system_prompt ?? req.body.systemPrompt],
      ['model', req.body.model],
      ['provider', req.body.provider],
      ['capabilities', req.body.capabilities !== undefined ? JSON.stringify(req.body.capabilities) : undefined],
      ['tools', req.body.tools !== undefined ? JSON.stringify(req.body.tools) : undefined],
      ['status', req.body.status],
    ];
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of fields) {
      if (value !== undefined) { values.push(value); updates.push(`${column} = $${values.length}`); }
    }
    if (updates.length === 0) throw new AppError(400, 'No agent fields supplied', 'BAD_REQUEST');
    updates.push('updated_at = NOW()');
    values.push(req.params.id, organizationId);
    const result = await query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length} AND deleted_at IS NULL RETURNING *`,
      values
    );
    if (result.rows.length === 0) throw new NotFoundError('Agent');
    res.json({ success: true, data: mapAgent(result.rows[0]) });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    const result = await query('UPDATE agents SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id', [req.params.id, organizationId]);
    if (result.rows.length === 0) throw new NotFoundError('Agent');
    res.json({ success: true, data: { message: 'Agent deleted' } });
  } catch (error) { next(error); }
});

router.post('/:id/execute', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = orgId(req);
    const result = await agentOrchestrator.execute({
      agentId: req.params.id,
      orgId: organizationId,
      userId: req.user!.userId,
      task: req.body.task || req.body.prompt,
      input: req.body.input,
      conversationId: req.body.conversation_id,
      maxTurns: req.body.max_turns,
    });
    res.json({
      success: true,
      data: {
        ...result,
        output: result.response,
        tokenUsage: { prompt: result.tokensUsed.in, completion: result.tokensUsed.out, total: result.tokensUsed.in + result.tokensUsed.out },
        cost: result.costCents / 100,
      },
    });
  } catch (error) { next(error); }
});

export default router;
