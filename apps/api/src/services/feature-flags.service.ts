import { query } from '../config/database';
import { logger } from '../utils/logger';

// Types
export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  enabled_for_plans: string[];
  enabled_for_orgs: string[];
  enabled_for_roles: string[];
  beta_access: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateFeatureFlagData {
  key: string;
  name: string;
  description?: string;
  is_enabled?: boolean;
  enabled_for_plans?: string[];
  enabled_for_orgs?: string[];
  enabled_for_roles?: string[];
  beta_access?: boolean;
  config?: Record<string, unknown>;
}

// ─── Feature Flag CRUD ───────────────────────────────────────────────────────

export async function listFlags(): Promise<FeatureFlag[]> {
  const result = await query('SELECT * FROM feature_flags ORDER BY key ASC');
  return result.rows.map(mapFlagRow);
}

export async function getFlagByKey(key: string): Promise<FeatureFlag | null> {
  const result = await query('SELECT * FROM feature_flags WHERE key = $1', [key]);
  return result.rows.length > 0 ? mapFlagRow(result.rows[0]) : null;
}

export async function createFlag(data: CreateFeatureFlagData): Promise<FeatureFlag> {
  const result = await query(
    `INSERT INTO feature_flags (key, name, description, is_enabled, enabled_for_plans, enabled_for_orgs, enabled_for_roles, beta_access, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      data.key,
      data.name,
      data.description || null,
      data.is_enabled ?? false,
      JSON.stringify(data.enabled_for_plans || []),
      JSON.stringify(data.enabled_for_orgs || []),
      JSON.stringify(data.enabled_for_roles || []),
      data.beta_access ?? false,
      JSON.stringify(data.config || {}),
    ]
  );
  logger.info(`Feature flag created: ${data.key}`);
  return mapFlagRow(result.rows[0]);
}

export async function updateFlag(key: string, data: Partial<CreateFeatureFlagData>): Promise<FeatureFlag> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.is_enabled !== undefined) { updates.push(`is_enabled = $${idx++}`); values.push(data.is_enabled); }
  if (data.enabled_for_plans !== undefined) { updates.push(`enabled_for_plans = $${idx++}`); values.push(JSON.stringify(data.enabled_for_plans)); }
  if (data.enabled_for_orgs !== undefined) { updates.push(`enabled_for_orgs = $${idx++}`); values.push(JSON.stringify(data.enabled_for_orgs)); }
  if (data.enabled_for_roles !== undefined) { updates.push(`enabled_for_roles = $${idx++}`); values.push(JSON.stringify(data.enabled_for_roles)); }
  if (data.beta_access !== undefined) { updates.push(`beta_access = $${idx++}`); values.push(data.beta_access); }
  if (data.config !== undefined) { updates.push(`config = $${idx++}`); values.push(JSON.stringify(data.config)); }

  if (updates.length === 0) {
    const existing = await getFlagByKey(key);
    if (!existing) throw new Error('Feature flag not found');
    return existing;
  }

  updates.push('updated_at = NOW()');
  values.push(key);

  const result = await query(
    `UPDATE feature_flags SET ${updates.join(', ')} WHERE key = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new Error('Feature flag not found');
  logger.info(`Feature flag updated: ${key}`);
  return mapFlagRow(result.rows[0]);
}

export async function deleteFlag(key: string): Promise<void> {
  await query('DELETE FROM feature_flags WHERE key = $1', [key]);
  logger.info(`Feature flag deleted: ${key}`);
}

// ─── Feature Evaluation ──────────────────────────────────────────────────────

export async function isEnabled(
  key: string,
  context: {
    plan?: string;
    orgId?: string;
    role?: string;
    isBetaUser?: boolean;
  }
): Promise<boolean> {
  const flag = await getFlagByKey(key);
  if (!flag) return false;

  // Global disable
  if (!flag.is_enabled) return false;

  // Check plan
  if (flag.enabled_for_plans.length > 0 && context.plan) {
    if (flag.enabled_for_plans.includes(context.plan)) return true;
  }

  // Check organization
  if (flag.enabled_for_orgs.length > 0 && context.orgId) {
    if (flag.enabled_for_orgs.includes(context.orgId)) return true;
  }

  // Check role
  if (flag.enabled_for_roles.length > 0 && context.role) {
    if (flag.enabled_for_roles.includes(context.role)) return true;
  }

  // Check beta access
  if (flag.beta_access && context.isBetaUser) return true;

  // If no specific filters, global enable
  if (
    flag.enabled_for_plans.length === 0 &&
    flag.enabled_for_orgs.length === 0 &&
    flag.enabled_for_roles.length === 0 &&
    !flag.beta_access
  ) {
    return true;
  }

  return false;
}

export async function evaluateFlags(
  context: {
    plan?: string;
    orgId?: string;
    role?: string;
    isBetaUser?: boolean;
  }
): Promise<Record<string, boolean>> {
  const flags = await listFlags();
  const result: Record<string, boolean> = {};

  for (const flag of flags) {
    result[flag.key] = await isEnabled(flag.key, context);
  }

  return result;
}

// ─── Seed Default Flags ──────────────────────────────────────────────────────

export async function seedDefaultFlags(): Promise<void> {
  const defaults: CreateFeatureFlagData[] = [
    {
      key: 'ai_content_generation',
      name: 'AI Content Generation',
      description: 'Enable AI-powered content generation',
      is_enabled: true,
      enabled_for_plans: ['starter', 'professional', 'enterprise'],
    },
    {
      key: 'seo_tools',
      name: 'SEO Tools',
      description: 'Enable SEO analysis and optimization tools',
      is_enabled: true,
      enabled_for_plans: ['professional', 'enterprise'],
    },
    {
      key: 'social_publishing',
      name: 'Social Publishing',
      description: 'Enable social media publishing',
      is_enabled: true,
      enabled_for_plans: ['professional', 'enterprise'],
    },
    {
      key: 'crm',
      name: 'CRM',
      description: 'Enable CRM functionality',
      is_enabled: true,
      enabled_for_plans: ['professional', 'enterprise'],
    },
    {
      key: 'white_label',
      name: 'White Label',
      description: 'Enable white-label branding',
      is_enabled: true,
      enabled_for_plans: ['enterprise'],
    },
    {
      key: 'api_access',
      name: 'API Access',
      description: 'Enable REST API access',
      is_enabled: true,
      enabled_for_plans: ['professional', 'enterprise'],
    },
    {
      key: 'advanced_analytics',
      name: 'Advanced Analytics',
      description: 'Enable advanced analytics and reporting',
      is_enabled: true,
      enabled_for_plans: ['professional', 'enterprise'],
    },
    {
      key: 'beta_features',
      name: 'Beta Features',
      description: 'Enable beta features for testing',
      is_enabled: false,
      beta_access: true,
    },
  ];

  for (const flag of defaults) {
    const existing = await getFlagByKey(flag.key);
    if (!existing) {
      await createFlag(flag);
    }
  }

  logger.info('Default feature flags seeded');
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapFlagRow(row: Record<string, unknown>): FeatureFlag {
  return {
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    description: row.description as string | null,
    is_enabled: row.is_enabled as boolean,
    enabled_for_plans: typeof row.enabled_for_plans === 'string' ? JSON.parse(row.enabled_for_plans) : (row.enabled_for_plans as string[]) || [],
    enabled_for_orgs: typeof row.enabled_for_orgs === 'string' ? JSON.parse(row.enabled_for_orgs) : (row.enabled_for_orgs as string[]) || [],
    enabled_for_roles: typeof row.enabled_for_roles === 'string' ? JSON.parse(row.enabled_for_roles) : (row.enabled_for_roles as string[]) || [],
    beta_access: row.beta_access as boolean,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
