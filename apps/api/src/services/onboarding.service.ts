import { query } from '../config/database';
import { hashPassword } from '../utils/encryption';
import { AppError } from '../middleware/errorHandler';
import { User, Organization, OnboardingAdminData, AppConfigureData } from '../types';
import { logger } from '../utils/logger';
import { providerRouter } from '../providers/provider-router';

export async function getStatus(): Promise<{
  needsAdmin: boolean;
  needsProviders: boolean;
  needsOrganization: boolean;
  isComplete: boolean;
}> {
  const [adminResult, providerResult, orgResult] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM users WHERE role IN ('admin','superadmin') AND deleted_at IS NULL"),
    query("SELECT COUNT(*) AS count FROM ai_providers WHERE enabled=TRUE AND LOWER(name)='genx' AND LOWER(type)='genx'"),
    query('SELECT COUNT(*) AS count FROM organizations WHERE deleted_at IS NULL'),
  ]);
  const needsAdmin = Number(adminResult.rows[0].count) === 0;
  const needsProviders = Number(providerResult.rows[0].count) === 0;
  const needsOrganization = Number(orgResult.rows[0].count) === 0;
  return { needsAdmin, needsProviders, needsOrganization, isComplete: !needsAdmin && !needsProviders && !needsOrganization };
}

export async function createAdmin(data: OnboardingAdminData): Promise<User> {
  const existingAdmin = await query("SELECT id FROM users WHERE role IN ('admin','superadmin') AND deleted_at IS NULL");
  if (existingAdmin.rows.length > 0) throw new AppError(400, 'Admin already exists', 'ADMIN_EXISTS');
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [data.email.toLowerCase()]);
  if (existingUser.rows.length > 0) throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
  const result = await query(
    `INSERT INTO users (email, password_hash, name, role, email_verified)
     VALUES ($1,$2,$3,'admin',TRUE) RETURNING *`,
    [data.email.toLowerCase(), await hashPassword(data.password), data.name]
  );
  logger.info(`Admin user created: ${data.email}`);
  return result.rows[0];
}

export async function configureApp(data: AppConfigureData): Promise<void> {
  await query(
    `INSERT INTO system_settings (key, value)
     VALUES ('app_config',$1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(data)]
  );
  logger.info('App configuration saved');
}

export async function testProviders(): Promise<{ name: string; success: boolean; latency_ms?: number; error?: string }[]> {
  await providerRouter.loadProviders();
  return (await providerRouter.getHealthStatus()).map((provider) => ({
    name: provider.name,
    success: provider.status === 'healthy',
    latency_ms: provider.latency,
    error: provider.error,
  }));
}

export async function createFirstOrganization(data: { name: string; slug: string }, userId: string): Promise<Organization> {
  const existing = await query('SELECT id FROM organizations WHERE deleted_at IS NULL');
  if (existing.rows.length > 0) throw new AppError(400, 'Organization already exists', 'ORG_EXISTS');
  const result = await query('INSERT INTO organizations (name, slug) VALUES ($1,$2) RETURNING *', [data.name, data.slug]);
  await query(
    `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
     VALUES ($1,$2,'owner',$2)`,
    [result.rows[0].id, userId]
  );
  logger.info(`First organization created: ${data.slug}`);
  return result.rows[0];
}

export async function complete(): Promise<void> {
  await query(
    `INSERT INTO system_settings (key, value)
     VALUES ('onboarding_complete','{"value":true}')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
  );
  logger.info('Onboarding completed');
}
