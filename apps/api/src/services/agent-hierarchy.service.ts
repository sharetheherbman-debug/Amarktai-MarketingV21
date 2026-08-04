import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentHierarchyNode {
  id: string;
  organization_id: string;
  agent_id: string | null;
  parent_id: string | null;
  role: 'ceo' | 'director' | 'manager' | 'worker';
  level: number;
  capabilities: string[];
  delegation_rules: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

// ─── Hierarchy Management ────────────────────────────────────────────────────

export async function buildHierarchy(orgId: string): Promise<AgentHierarchyNode[]> {
  const result = await query(
    'SELECT * FROM ai_agent_hierarchy WHERE organization_id = $1 ORDER BY level ASC, role ASC',
    [orgId]
  );
  return result.rows.map(mapRow);
}

export async function assignAgent(orgId: string, agentId: string, role: string, parentId?: string): Promise<AgentHierarchyNode> {
  const level = role === 'ceo' ? 0 : role === 'director' ? 1 : role === 'manager' ? 2 : 3;

  const result = await query(
    `INSERT INTO ai_agent_hierarchy (organization_id, agent_id, parent_id, role, level)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, agentId, parentId || null, role, level]
  );

  logger.info(`Agent ${agentId} assigned as ${role} in hierarchy`);
  return mapRow(result.rows[0]);
}

export async function delegateTask(orgId: string, taskId: string, fromRole: string, toRole: string, context: Record<string, unknown>): Promise<{ assigned_agent_id: string; delegation_path: string[] }> {
  // Find appropriate agent in hierarchy
  const agents = await query(
    `SELECT ah.*, ad.name as agent_name FROM ai_agent_hierarchy ah
     LEFT JOIN agent_definitions ad ON ah.agent_id = ad.id
     WHERE ah.organization_id = $1 AND ah.role = $2 AND ah.is_active = TRUE
     ORDER BY ah.level ASC LIMIT 1`,
    [orgId, toRole]
  );

  if (agents.rows.length === 0) {
    throw new AppError(404, `No active ${toRole} agent found in hierarchy`, 'NO_AGENT');
  }

  const agent = agents.rows[0];
  const path = [fromRole, toRole];

  logger.info(`Task ${taskId} delegated from ${fromRole} to ${toRole} (${agent.agent_name})`);
  return { assigned_agent_id: agent.agent_id as string, delegation_path: path };
}

export async function getSubordinates(orgId: string, parentId: string): Promise<AgentHierarchyNode[]> {
  const result = await query(
    'SELECT * FROM ai_agent_hierarchy WHERE organization_id = $1 AND parent_id = $2 ORDER BY level ASC',
    [orgId, parentId]
  );
  return result.rows.map(mapRow);
}

export async function initializeDefaultHierarchy(orgId: string): Promise<void> {
  const hierarchy = [
    { role: 'ceo', level: 0 },
    { role: 'director', level: 1 },
    { role: 'manager', level: 2 },
    { role: 'worker', level: 3 },
  ];

  for (const h of hierarchy) {
    await query(
      `INSERT INTO ai_agent_hierarchy (organization_id, role, level, capabilities, delegation_rules)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [
        orgId, h.role, h.level,
        JSON.stringify(getDefaultCapabilities(h.role)),
        JSON.stringify(getDefaultDelegation(h.role)),
      ]
    );
  }
}

function getDefaultCapabilities(role: string): string[] {
  const caps: Record<string, string[]> = {
    ceo: ['strategy', 'planning', 'delegation', 'review'],
    director: ['campaign_planning', 'resource_allocation', 'approval', 'reporting'],
    manager: ['task_assignment', 'quality_review', 'scheduling', 'coordination'],
    worker: ['content_creation', 'data_collection', 'publishing', 'monitoring'],
  };
  return caps[role] || [];
}

function getDefaultDelegation(role: string): Record<string, unknown> {
  const rules: Record<string, Record<string, unknown>> = {
    ceo: { can_delegate_to: ['director'], auto_delegate_threshold: 'high' },
    director: { can_delegate_to: ['manager'], auto_delegate_threshold: 'medium' },
    manager: { can_delegate_to: ['worker'], auto_delegate_threshold: 'low' },
    worker: { can_delegate_to: [], auto_delegate_threshold: null },
  };
  return rules[role] || {};
}

function mapRow(row: Record<string, unknown>): AgentHierarchyNode {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    agent_id: row.agent_id as string | null,
    parent_id: row.parent_id as string | null,
    role: row.role as AgentHierarchyNode['role'],
    level: parseInt(row.level as string),
    capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : (row.capabilities as string[]) || [],
    delegation_rules: typeof row.delegation_rules === 'string' ? JSON.parse(row.delegation_rules) : (row.delegation_rules as Record<string, unknown>) || {},
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
  };
}
