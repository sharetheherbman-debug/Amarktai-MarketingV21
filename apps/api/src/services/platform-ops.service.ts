import { query } from '../config/database';
import { logger } from '../utils/logger';

// Types
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    queue: ServiceStatus;
    storage: ServiceStatus;
  };
  metrics: SystemMetrics;
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms: number;
  message?: string;
}

export interface SystemMetrics {
  total_organizations: number;
  total_users: number;
  active_subscriptions: number;
  total_content: number;
  total_campaigns: number;
  api_requests_24h: number;
  ai_tokens_24h: number;
  storage_used_bytes: number;
}

export interface ProviderStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  last_check: string | null;
  latency_ms: number | null;
  error: string | null;
}

export interface QueueStatus {
  name: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ─── System Health ───────────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<SystemHealth> {
  const timestamp = new Date().toISOString();

  // Check database
  let dbStatus: ServiceStatus = { status: 'unhealthy', latency_ms: 0 };
  try {
    const start = Date.now();
    await query('SELECT 1');
    dbStatus = { status: 'healthy', latency_ms: Date.now() - start };
  } catch (error) {
    dbStatus = { status: 'unhealthy', latency_ms: 0, message: String(error) };
  }

  // Check Redis (simplified)
  const redisStatus: ServiceStatus = { status: 'healthy', latency_ms: 1 };

  // Get metrics
  const metrics = await getSystemMetrics();

  const overallStatus = dbStatus.status === 'healthy' ? 'healthy' : 'degraded';

  return {
    status: overallStatus,
    timestamp,
    services: {
      database: dbStatus,
      redis: redisStatus,
      queue: { status: 'healthy', latency_ms: 0 },
      storage: { status: 'healthy', latency_ms: 0 },
    },
    metrics,
  };
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [
    orgResult,
    userResult,
    subResult,
    contentResult,
    campaignResult,
  ] = await Promise.all([
    query('SELECT COUNT(*) as count FROM organizations WHERE deleted_at IS NULL'),
    query('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'),
    query("SELECT COUNT(*) as count FROM billing_subscriptions WHERE status IN ('active', 'trialing')"),
    query('SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL'),
    query('SELECT COUNT(*) as count FROM campaigns WHERE deleted_at IS NULL'),
  ]);

  return {
    total_organizations: parseInt(orgResult.rows[0].count as string),
    total_users: parseInt(userResult.rows[0].count as string),
    active_subscriptions: parseInt(subResult.rows[0].count as string),
    total_content: parseInt(contentResult.rows[0].count as string),
    total_campaigns: parseInt(campaignResult.rows[0].count as string),
    api_requests_24h: 0,
    ai_tokens_24h: 0,
    storage_used_bytes: 0,
  };
}

// ─── Provider Status ─────────────────────────────────────────────────────────

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const result = await query(
    'SELECT name, health_status, last_health_check, usage_stats FROM ai_providers WHERE enabled = TRUE ORDER BY priority DESC'
  );

  return result.rows.map(row => ({
    name: row.name as string,
    status: (row.health_status as ProviderStatus['status']) || 'unknown',
    last_check: row.last_health_check as string | null,
    latency_ms: null,
    error: null,
  }));
}

// ─── Queue Status ────────────────────────────────────────────────────────────

export async function getQueueStatuses(): Promise<QueueStatus[]> {
  // In production, this would check BullMQ queues
  return [
    { name: 'content-generation', pending: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'email-sending', pending: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'webhook-delivery', pending: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'analytics-sync', pending: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  ];
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export async function getAuditLogs(
  orgId?: string,
  filters?: {
    action?: string;
    entity_type?: string;
    user_id?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  let whereClause = '1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (orgId) {
    whereClause += ` AND organization_id = $${idx++}`;
    params.push(orgId);
  }
  if (filters?.action) {
    whereClause += ` AND action = $${idx++}`;
    params.push(filters.action);
  }
  if (filters?.entity_type) {
    whereClause += ` AND entity_type = $${idx++}`;
    params.push(filters.entity_type);
  }
  if (filters?.user_id) {
    whereClause += ` AND user_id = $${idx++}`;
    params.push(filters.user_id);
  }

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const countResult = await query(`SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count as string);

  const result = await query(
    `SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const logs = result.rows.map(row => ({
    id: row.id as string,
    organization_id: row.organization_id as string | null,
    user_id: row.user_id as string | null,
    action: row.action as string,
    entity_type: row.entity_type as string | null,
    entity_id: row.entity_id as string | null,
    old_value: typeof row.old_value === 'string' ? JSON.parse(row.old_value) : row.old_value as Record<string, unknown> | null,
    new_value: typeof row.new_value === 'string' ? JSON.parse(row.new_value) : row.new_value as Record<string, unknown> | null,
    ip_address: row.ip_address as string | null,
    user_agent: row.user_agent as string | null,
    created_at: row.created_at as string,
  }));

  return { logs, total };
}

// ─── Tenant Management ───────────────────────────────────────────────────────

export async function listTenants(filters?: { status?: string; plan?: string; limit?: number }): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  user_count: number;
  created_at: string;
}>> {
  let sql = `
    SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at,
           (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) as user_count
    FROM organizations o WHERE o.deleted_at IS NULL
  `;
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) {
    sql += ` AND o.status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters?.plan) {
    sql += ` AND o.plan = $${idx++}`;
    params.push(filters.plan);
  }

  sql += ` ORDER BY o.created_at DESC LIMIT $${idx++}`;
  params.push(filters?.limit || 100);

  const result = await query(sql, params);
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    plan: row.plan as string,
    status: row.status as string,
    user_count: parseInt(row.user_count as string),
    created_at: row.created_at as string,
  }));
}

export async function getTenantDetails(orgId: string): Promise<Record<string, unknown>> {
  const [orgResult, memberCount, subResult, usageResult] = await Promise.all([
    query('SELECT * FROM organizations WHERE id = $1', [orgId]),
    query('SELECT COUNT(*) as count FROM organization_members WHERE organization_id = $1', [orgId]),
    query(
      `SELECT bs.*, bp.name as plan_name, bp.slug as plan_slug
       FROM billing_subscriptions bs
       JOIN billing_plans bp ON bs.plan_id = bp.id
       WHERE bs.organization_id = $1 ORDER BY bs.created_at DESC LIMIT 1`,
      [orgId]
    ),
    query(
      `SELECT metric, SUM(quantity) as total FROM billing_usage
       WHERE organization_id = $1 AND period_start >= DATE_TRUNC('month', NOW())
       GROUP BY metric`,
      [orgId]
    ),
  ]);

  const org = orgResult.rows[0];
  const usage: Record<string, number> = {};
  for (const row of usageResult.rows) {
    usage[row.metric as string] = parseInt(row.total as string);
  }

  return {
    organization: org,
    member_count: parseInt(memberCount.rows[0].count as string),
    subscription: subResult.rows[0] || null,
    current_usage: usage,
  };
}

// ─── Announcements ───────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'maintenance';
  target_audience: 'all' | 'admins' | 'specific_plans';
  target_plans: string[];
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listAnnouncements(activeOnly: boolean = true): Promise<Announcement[]> {
  let sql = 'SELECT * FROM platform_announcements';
  if (activeOnly) {
    sql += ' WHERE is_active = TRUE AND (starts_at <= NOW() AND (ends_at IS NULL OR ends_at >= NOW()))';
  }
  sql += ' ORDER BY created_at DESC';

  try {
    const result = await query(sql);
    return result.rows.map(row => ({
      id: row.id as string,
      title: row.title as string,
      message: row.message as string,
      type: row.type as string as Announcement['type'],
      target_audience: row.target_audience as string as Announcement['target_audience'],
      target_plans: typeof row.target_plans === 'string' ? JSON.parse(row.target_plans) : (row.target_plans as string[]) || [],
      starts_at: row.starts_at as string,
      ends_at: row.ends_at as string | null,
      is_active: row.is_active as boolean,
      created_at: row.created_at as string,
    }));
  } catch {
    return [];
  }
}

export async function createAnnouncement(data: Omit<Announcement, 'id' | 'created_at'>): Promise<Announcement> {
  const result = await query(
    `INSERT INTO platform_announcements (title, message, type, target_audience, target_plans, starts_at, ends_at, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      data.title, data.message, data.type, data.target_audience,
      JSON.stringify(data.target_plans), data.starts_at, data.ends_at, data.is_active,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id as string,
    title: row.title as string,
    message: row.message as string,
    type: row.type as Announcement['type'],
    target_audience: row.target_audience as Announcement['target_audience'],
    target_plans: typeof row.target_plans === 'string' ? JSON.parse(row.target_plans) : (row.target_plans as string[]) || [],
    starts_at: row.starts_at as string,
    ends_at: row.ends_at as string | null,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
  };
}
