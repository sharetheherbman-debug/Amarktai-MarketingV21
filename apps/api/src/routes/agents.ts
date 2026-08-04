import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validator';
import { createAgentSchema, executeAgentSchema, paginationSchema } from '../utils/validation';
import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { addJob } from '../queue/queue.service';
import { agentOrchestrator } from '../services/agent-orchestrator.service';
import { taskPlanner } from '../services/task-planner.service';
import { ApiResponse, PaginatedResponse } from '../types';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(paginationSchema), async (req: AuthRequest, res: Response<PaginatedResponse<any>>, next: NextFunction) => {
  try {
    const { page, limit, sort, order, search } = req.query as any;
    const offset = (page - 1) * limit;
    const orgId = req.query.organization_id as string;
    const type = req.query.type as string;

    let whereClause = 'WHERE a.deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 1;

    if (orgId) {
      whereClause += ` AND a.organization_id = $${paramCount++}`;
      params.push(orgId);
    }

    if (type) {
      whereClause += ` AND a.type = $${paramCount++}`;
      params.push(type);
    }

    if (search) {
      whereClause += ` AND (a.name ILIKE $${paramCount} OR a.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    const countResult = await query(`SELECT COUNT(*) FROM agents a ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const allowedSortFields = ['created_at', 'updated_at', 'name', 'type', 'status'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const result = await query(
      `SELECT a.* FROM agents a ${whereClause} ORDER BY a.${sortField} ${sortOrder} LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(createAgentSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, description, type, config, system_prompt, model, provider, capabilities } = req.body;
    const orgId = req.query.organization_id as string || req.body.organization_id;

    const result = await query(
      `INSERT INTO agents (organization_id, name, description, type, config, system_prompt, model, provider, capabilities, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [orgId, name, description || null, type, JSON.stringify(config || {}), system_prompt || null, model || null, provider || null, JSON.stringify(capabilities || []), req.user!.userId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, description, type, config, system_prompt, model, provider, capabilities, status } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name) { updates.push(`name = $${paramCount++}`); values.push(name); }
    if (description) { updates.push(`description = $${paramCount++}`); values.push(description); }
    if (type) { updates.push(`type = $${paramCount++}`); values.push(type); }
    if (config) { updates.push(`config = $${paramCount++}`); values.push(JSON.stringify(config)); }
    if (system_prompt) { updates.push(`system_prompt = $${paramCount++}`); values.push(system_prompt); }
    if (model) { updates.push(`model = $${paramCount++}`); values.push(model); }
    if (provider) { updates.push(`provider = $${paramCount++}`); values.push(provider); }
    if (capabilities) { updates.push(`capabilities = $${paramCount++}`); values.push(JSON.stringify(capabilities)); }
    if (status) { updates.push(`status = $${paramCount++}`); values.push(status); }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'UPDATE agents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    res.json({ success: true, data: { message: 'Agent deleted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/execute', validateBody(executeAgentSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agentResult = await query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);

    if (agentResult.rows.length === 0) {
      throw new NotFoundError('Agent');
    }

    const agent = agentResult.rows[0];

    if (agent.status !== 'active') {
      throw new AppError(400, 'Agent is not active', 'AGENT_INACTIVE');
    }

    const orgId = req.body.organization_id || req.query.organization_id as string;

    const result = await agentOrchestrator.execute({
      agentId: req.params.id,
      orgId,
      userId: req.user!.userId,
      task: req.body.task,
      input: req.body.input,
      conversationId: req.body.conversation_id,
      maxTurns: req.body.max_turns,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/conversations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    const agentId = req.query.agent_id as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!orgId) {
      throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    }

    const conversations = await agentOrchestrator.listConversations(orgId, agentId, limit);

    res.json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
});

router.get('/conversations/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
    }

    const conversation = await agentOrchestrator.getConversation(req.params.id, orgId);

    res.json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
});

const createPlanSchema = require('zod').z.object({
  goal: require('zod').z.string().min(1, 'Goal is required'),
  organization_id: require('zod').z.string().uuid(),
  context: require('zod').z.record(require('zod').z.unknown()).optional(),
  max_tasks: require('zod').z.number().int().min(1).max(20).optional(),
});

router.post('/plan', validateBody(createPlanSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { goal, organization_id, context, max_tasks } = req.body;

    const plan = await taskPlanner.createPlan({
      orgId: organization_id,
      userId: req.user!.userId,
      goal,
      context,
      maxTasks: max_tasks,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
});

const executePlanSchema = require('zod').z.object({
  plan: require('zod').z.object({
    id: require('zod').z.string(),
    goal: require('zod').z.string(),
    tasks: require('zod').z.array(require('zod').z.object({
      title: require('zod').z.string(),
      description: require('zod').z.string(),
      type: require('zod').z.string(),
      agentSlug: require('zod').z.string(),
      priority: require('zod').z.number(),
      dependencies: require('zod').z.array(require('zod').z.string()),
      estimatedDuration: require('zod').z.string(),
    })),
    estimatedTotalDuration: require('zod').z.string(),
    recommendedAgent: require('zod').z.string(),
  }),
  organization_id: require('zod').z.string().uuid(),
});

router.post('/plan/execute', validateBody(executePlanSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { plan, organization_id } = req.body;

    const taskIds = await taskPlanner.executePlan(plan, organization_id, req.user!.userId);

    res.status(201).json({
      success: true,
      data: {
        plan_id: plan.id,
        task_ids: taskIds,
        tasks_created: taskIds.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
