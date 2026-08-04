import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import * as memoryService from '../memory/memory.service';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../types';

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
    `SELECT id, name, slug, type, description FROM agents WHERE organization_id = $1 AND status = 'active' AND deleted_at IS NULL ORDER BY name`,
    [orgId]
  );

  return result.rows;
}

async function getBrandContext(orgId: string): Promise<string> {
  try {
    const brandMemories = await memoryService.getBrandMemory(orgId);

    if (brandMemories.length === 0) {
      return '';
    }

    const parts: string[] = ['Brand Context:'];
    for (const memory of brandMemories.slice(0, 10)) {
      parts.push(`- ${memory.key}: ${JSON.stringify(memory.value)}`);
    }

    return parts.join('\n');
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
  maxTasks: number = 10
): ChatMessage[] {
  const agentDescriptions = agents
    .map((a) => `- ${a.slug || a.name} (${a.type}): ${a.description || 'No description'}`)
    .join('\n');

  const contextStr = context ? `\nAdditional Context:\n${JSON.stringify(context, null, 2)}` : '';

  const systemPrompt = `You are a task planning assistant for a marketing platform. Your job is to break down marketing goals into actionable tasks.

Available Agents:
${agentDescriptions || 'No agents available'}

${brandContext}${contextStr}

IMPORTANT: You must respond with ONLY valid JSON, no other text. The JSON must match this exact schema:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "type": "string (one of: content, analytics, social, email, research, custom)",
      "agentSlug": "string (must match an available agent slug)",
      "priority": number (1-10, 10 is highest),
      "dependencies": ["string indices of dependent tasks"],
      "estimatedDuration": "string (e.g., '30 minutes', '2 hours')"
    }
  ],
  "estimatedTotalDuration": "string",
  "recommendedAgent": "string (agent slug)"
}`;

  const userPrompt = `Break down this marketing goal into up to ${maxTasks} actionable tasks:

Goal: ${goal}

Respond with ONLY valid JSON.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

function parsePlanResponse(response: string, goal: string): Omit<TaskPlan, 'id' | 'createdAt'> {
  try {
    let jsonStr = response.trim();

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error('Invalid response: missing tasks array');
    }

    const tasks: PlannedTask[] = parsed.tasks.map((task: any, index: number) => ({
      title: task.title || `Task ${index + 1}`,
      description: task.description || '',
      type: task.type || 'custom',
      agentSlug: task.agentSlug || '',
      priority: typeof task.priority === 'number' ? task.priority : 5,
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
      estimatedDuration: task.estimatedDuration || 'Unknown',
    }));

    return {
      goal,
      tasks,
      estimatedTotalDuration: parsed.estimatedTotalDuration || 'Unknown',
      recommendedAgent: parsed.recommendedAgent || '',
    };
  } catch (error) {
    logger.error(`Failed to parse plan response: ${error}`);
    logger.debug(`Raw response: ${response}`);

    return {
      goal,
      tasks: [
        {
          title: 'Execute goal directly',
          description: goal,
          type: 'custom',
          agentSlug: '',
          priority: 10,
          dependencies: [],
          estimatedDuration: 'Unknown',
        },
      ],
      estimatedTotalDuration: 'Unknown',
      recommendedAgent: '',
    };
  }
}

export async function createPlan(options: PlanOptions): Promise<TaskPlan> {
  const { orgId, userId, goal, context, maxTasks = 10 } = options;

  logger.info(`Creating task plan for goal: ${goal.substring(0, 100)}...`);

  const [agents, brandContext] = await Promise.all([
    getAvailableAgents(orgId),
    getBrandContext(orgId),
  ]);

  const messages = buildPlanningPrompt(goal, agents, brandContext, context, maxTasks);

  const result = await providerRouter.routeRequest(messages, 'gpt-4o-mini', {
    temperature: 0.3,
    max_tokens: 2000,
  }, {
    organizationId: orgId,
    userId,
  });

  const planData = parsePlanResponse(result.content, goal);

  const plan: TaskPlan = {
    id: uuidv4(),
    ...planData,
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
      .map((dep) => {
        const index = parseInt(dep, 10);
        return index >= 0 && index < taskIds.length ? taskIds[index] : null;
      })
      .filter(Boolean);

    let agentId: string | null = null;
    if (task.agentSlug) {
      const agentResult = await query(
        `SELECT id FROM agents WHERE slug = $1 AND organization_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [task.agentSlug, orgId]
      );

      if (agentResult.rows.length > 0) {
        agentId = agentResult.rows[0].id;
      }
    }

    if (!agentId && plan.recommendedAgent) {
      const agentResult = await query(
        `SELECT id FROM agents WHERE slug = $1 AND organization_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [plan.recommendedAgent, orgId]
      );

      if (agentResult.rows.length > 0) {
        agentId = agentResult.rows[0].id;
      }
    }

    const taskResult = await query(
      `INSERT INTO tasks (id, organization_id, agent_id, name, type, status, input, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        uuidv4(),
        orgId,
        agentId,
        task.title,
        task.type,
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

    taskIds.push(taskResult.rows[0].id);

    logger.info(`Task created: ${task.title} (${taskResult.rows[0].id})`);
  }

  logger.info(`Task plan executed: ${taskIds.length} tasks created`);

  return taskIds;
}

export const taskPlanner = {
  createPlan,
  executePlan,
};

export default taskPlanner;
