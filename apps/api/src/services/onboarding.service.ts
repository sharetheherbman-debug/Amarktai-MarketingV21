import { query } from '../config/database';
import { hashPassword, encrypt, decrypt } from '../utils/encryption';
import { AppError } from '../middleware/errorHandler';
import { User, Organization, OnboardingAdminData, AppConfigureData, ProviderConfig, ProviderType } from '../types';
import { logger } from '../utils/logger';
import { providerRouter } from '../providers/provider-router';

function normalizeProviderType(name: string): Extract<ProviderType, 'genx' | 'together' | 'deepinfra'> {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('genx')) return 'genx';
  if (normalized.includes('together')) return 'together';
  if (normalized.includes('deepinfra')) return 'deepinfra';
  throw new AppError(400, `Unsupported AI provider: ${name}`, 'PROVIDER_TYPE_UNSUPPORTED');
}

function modelsUrl(type: string, baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '');
  if (type === 'genx') return `${normalized.replace(/\/(?:api\/v1|v1)$/, '')}/v1/models`;
  return `${normalized}/models`;
}

export async function getStatus(): Promise<{
  needsAdmin: boolean;
  needsProviders: boolean;
  needsOrganization: boolean;
  isComplete: boolean;
}> {
  const [adminResult, providerResult, orgResult] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM users WHERE role IN ('admin','superadmin') AND deleted_at IS NULL"),
    query('SELECT COUNT(*) AS count FROM ai_providers WHERE enabled = true'),
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

export async function configureProviders(providers: ProviderConfig[]): Promise<void> {
  if (providers.length === 0) throw new AppError(400, 'At least one provider is required', 'PROVIDER_REQUIRED');
  for (const provider of providers) {
    const type = normalizeProviderType(provider.name);
    const baseUrl = provider.baseUrl.replace(/\/$/, '');
    await query(
      `INSERT INTO ai_providers (name, type, api_key_encrypted, base_url, models, enabled, priority, health_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'unknown')
       ON CONFLICT (name) DO UPDATE SET
         type = EXCLUDED.type,
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         base_url = EXCLUDED.base_url,
         models = EXCLUDED.models,
         enabled = EXCLUDED.enabled,
         priority = EXCLUDED.priority,
         health_status = 'unknown',
         updated_at = NOW()`,
      [
        type,
        type,
        JSON.stringify(encrypt(provider.apiKey)),
        baseUrl,
        JSON.stringify(provider.models || []),
        provider.enabled,
        provider.priority,
      ]
    );
  }
  await providerRouter.loadProviders();
  logger.info(`Configured and loaded ${providers.length} AI providers`);
}

export async function testProviders(): Promise<{ name: string; success: boolean; latency_ms?: number; error?: string }[]> {
  const providers = await query('SELECT * FROM ai_providers WHERE enabled = true ORDER BY priority DESC');
  const results: { name: string; success: boolean; latency_ms?: number; error?: string }[] = [];
  for (const provider of providers.rows) {
    const started = Date.now();
    try {
      const response = await fetch(modelsUrl(String(provider.type), String(provider.base_url)), {
        headers: { Authorization: `Bearer ${decrypt(JSON.parse(provider.api_key_encrypted))}` },
        signal: AbortSignal.timeout(15000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      const latency = Date.now() - started;
      await query("UPDATE ai_providers SET health_status = 'healthy', last_health_check = NOW() WHERE id = $1", [provider.id]);
      results.push({ name: String(provider.name), success: true, latency_ms: latency });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      await query("UPDATE ai_providers SET health_status = 'unhealthy', last_health_check = NOW() WHERE id = $1", [provider.id]);
      results.push({ name: String(provider.name), success: false, latency_ms: Date.now() - started, error: message });
    }
  }
  await providerRouter.loadProviders();
  return results;
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
