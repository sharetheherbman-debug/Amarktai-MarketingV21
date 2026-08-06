import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import * as memoryService from '../memory/memory.service';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../types';
import { env } from '../config/env';

export interface PlanOptions {
  orgId: string;
  userId: string;
  goal: string;
  context?: Record<string, unknown>;
  maxTasks?: number;
}

export interface PlannedTask {
  title: string;
  description: string;
  type: string;
  agentSlug: string;
  priority: number;
  dependencies: string[];
  estimatedDuration: string;
}

export interface TaskPlan {
  id: string;
  goal: string;
  tasks: PlannedTask[];
  estimatedTotalDuration: string;
  recommendedAgent: string;
  createdAt: Date;
}

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
}

async function getAvailableAgents(orgId: string): Promise<AgentRow[]> {
  const result = await query(
    `SELECT id, name, slug, type, description FROM agents
     WHERE organization_id = $1 AND status = 'active' AND deleted_at IS NULL ORDER BY name`,
    [orgId]
  );
  return result.rows;
}

async function getBrandContext(orgId: string): Promise<string> {
  try {
    const brandMemories = await memoryService.getBrandMemory(orgId);
    if (brandMemories.length === 0) return '';
    return ['Brand Context:', ...brandMemories.slice(0, 10).map((memory) => `- ${memory.key}: ${JSON.stringify(memory.value)}`)].join('\n');
  } catch (error) {
    logger.warn(`Failed to load brand context for planning: ${error}`);
    return '';
  }
}

function buildPlanningPrompt(
  goal: string,
  agents: AgentRow[],
  brandContext: string,
  context?: Record<string, unknown>,
  maxTasks = 10
): ChatMessage[] {
  const agentDescriptions = agents.map((agent) => `- ${agent.slug} (${agent.type}): ${agent.description || 'No description'}`).join('\n');
  const contextText = context ? `\nAdditional Context:\n${JSON.stringify(context, null, 2)}` : '';
  const systemPrompt = `You are a task planning assistant for a marketing platform. Break goals into actionable tasks using only the available agents.\n\nAvailable Agents:\n${agentDescriptions || 'No agents available'}\n\n${brandContext}${contextText}\n\nReturn ONLY strict JSON matching:\n{"tasks":[{"title":"string","description":"string","type":"content|analytics|social|email|research|custom","agentSlug":"available slug or empty","priority":1,"dependencies":["zero-based prior task indexes"],"estimatedDuration":"string"}],"estimatedTotalDuration":"string","recommendedAgent":"available slug or empty"}`;
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Break down this goal into no more than ${Math.max(1, Math.min(maxTasks, 20))} tasks:\n\n${goal}` },
  ];
}

function parsePlanResponse(response: string, goal: string, agents: AgentRow[], maxTasks: number): Omit<TaskPlan, 'id' | 'createdAt'> {
  const cleaned = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new AppError(502, 'AI provider returned invalid task-plan JSON', 'AI_RESPONSE_INVALID');
    try { parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; }
    catch { throw new AppError(502, 'AI provider returned invalid task-plan JSON', 'AI_RESPONSE_INVALID'); }
  }

  if (!Array.isArray(parsed.tasks)) throw new AppError(502, 'AI task plan did not contain a tasks array', 'AI_RESPONSE_INVALID');
  const allowedTypes = new Set(['content', 'analytics', 'social', 'email', 'research', 'custom']);
  const allowedAgents = new Set(agents.map((agent) => agent.slug));
  const tasks = parsed.tasks.slice(0, Math.max(1, Math.min(maxTasks, 20))).flatMap((value, index): PlannedTask[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const title = String(row.title || '').trim();
    if (!title) return [];
    const requestedAgent = String(row.agentSlug || '').trim();
    const dependencies = Array.isArray(row.dependencies)
      ? row.dependencies.map(String).filter((dependency) => {
          const dependencyIndex = Number.parseInt(dependency, 10);
          return Number.isInteger(dependencyIndex) && dependencyIndex >= 0 && dependencyIndex < index;
        })
      : [];
    return [{
      title: title.slice(0, 255),
      description: String(row.description || '').slice(0, 5000),
      type: allowedTypes.has(String(row.type)) ? String(row.type) : 'custom',
      agentSlug: allowedAgents.has(requestedAgent) ? requestedAgent : '',
      priority: Math.max(1, Math.min(Number(row.priority || 5), 10)),
      dependencies,
      estimatedDuration: String(row.estimatedDuration || 'Unknown').slice(0, 100),
    }];
  });
  if (tasks.length === 0) throw new AppError(502, 'AI provider returned no usable tasks', 'AI_RESPONSE_INVALID');

  const recommended = String(parsed.recommendedAgent || '').trim();
  return {
    goal,
    tasks,
    estimatedTotalDuration: String(parsed.estimatedTotalDuration || 'Unknown').slice(0, 100),
    recommendedAgent: allowedAgents.has(recommended) ? recommended : '',
  };
}

export async function createPlan(options: PlanOptions): Promise<TaskPlan> {
  const { orgId, userId, goal, context, maxTasks = 10 } = options;
  if (!goal.trim()) throw new AppError(400, 'Goal is required', 'VALIDATION_ERROR');
  logger.info(`Creating task plan for goal: ${goal.substring(0, 100)}...`);
  const [agents, brandContext] = await Promise.all([getAvailableAgents(orgId), getBrandContext(orgId)]);
  const result = await providerRouter.routeRequest(
    buildPlanningPrompt(goal, agents, brandContext, context, maxTasks),
    env.DEFAULT_TEXT_MODEL,
    { temperature: 0.2, max_tokens: 2500 },
    { organizationId: orgId, userId }
  );
  const plan: TaskPlan = {
    id: uuidv4(),
    ...parsePlanResponse(result.content, goal, agents, maxTasks),
    createdAt: new Date(),
  };
  logger.info(`Task plan created with ${plan.tasks.length} tasks`);
  return plan;
}

export async function executePlan(plan: TaskPlan, orgId: string, userId: string): Promise<string[]> {
  logger.info(`Executing task plan: ${plan.id} with ${plan.tasks.length} tasks`);
  const taskIds: string[] = [];
  for (const task of plan.tasks) {
    const dependencyIds = task.dependencies
      .map((dependency) => {
        const index = Number.parseInt(dependency, 10);
        return index >= 0 && index < taskIds.length ? taskIds[index] : null;
      })
      .filter((value): value is string => Boolean(value));

    const agentSlug = task.agentSlug || plan.recommendedAgent;
    let agentId: string | null = null;
    if (agentSlug) {
      const agentResult = await query(
        `SELECT id FROM agents WHERE slug = $1 AND organization_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [agentSlug, orgId]
      );
      agentId = agentResult.rows[0]?.id || null;
    }

    const taskResult = await query(
      `INSERT INTO tasks (id, organization_id, agent_id, name, type, status, input, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,NOW(),NOW()) RETURNING id`,
      [
        uuidv4(), orgId, agentId, task.title, task.type,
        JSON.stringify({
          description: task.description,
          dependencies: dependencyIds,
          priority: task.priority,
          estimatedDuration: task.estimatedDuration,
          planId: plan.id,
        }),
        userId,
      ]
    );
    taskIds.push(String(taskResult.rows[0].id));
  }
  logger.info(`Task plan executed: ${taskIds.length} tasks created`);
  return taskIds;
}

export const taskPlanner = { createPlan, executePlan };
export default taskPlanner;
