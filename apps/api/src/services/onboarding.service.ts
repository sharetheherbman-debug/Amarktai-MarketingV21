import { query } from '../config/database';
import { hashPassword, encrypt, decrypt } from '../utils/encryption';
import { AppError } from '../middleware/errorHandler';
import { User, Organization, OnboardingAdminData, AppConfigureData, ProviderConfig } from '../types';
import { logger } from '../utils/logger';

export async function getStatus(): Promise<{
  needsAdmin: boolean;
  needsProviders: boolean;
  needsOrganization: boolean;
  isComplete: boolean;
}> {
  const adminResult = await query(
    "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND deleted_at IS NULL"
  );
  const needsAdmin = parseInt(adminResult.rows[0].count) === 0;

  const providerResult = await query(
    'SELECT COUNT(*) as count FROM ai_providers WHERE enabled = true'
  );
  const needsProviders = parseInt(providerResult.rows[0].count) === 0;

  const orgResult = await query(
    'SELECT COUNT(*) as count FROM organizations WHERE deleted_at IS NULL'
  );
  const needsOrganization = parseInt(orgResult.rows[0].count) === 0;

  return {
    needsAdmin,
    needsProviders,
    needsOrganization,
    isComplete: !needsAdmin && !needsProviders && !needsOrganization,
  };
}

export async function createAdmin(data: OnboardingAdminData): Promise<User> {
  const existingAdmin = await query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL"
  );
  if (existingAdmin.rows.length > 0) {
    throw new AppError(400, 'Admin already exists', 'ADMIN_EXISTS');
  }

  const existingUser = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existingUser.rows.length > 0) {
    throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
  }

  const passwordHash = await hashPassword(data.password);

  const result = await query(
    `INSERT INTO users (email, password_hash, name, role, email_verified)
     VALUES ($1, $2, $3, 'admin', true)
     RETURNING *`,
    [data.email, passwordHash, data.name]
  );

  logger.info(`Admin user created: ${data.email}`);
  return result.rows[0];
}

export async function configureApp(data: AppConfigureData): Promise<void> {
  await query(
    `INSERT INTO system_settings (key, value)
     VALUES ('app_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(data)]
  );

  logger.info('App configuration saved');
}

export async function configureProviders(providers: ProviderConfig[]): Promise<void> {
  for (const provider of providers) {
    const encryptedKey = JSON.stringify(encrypt(provider.apiKey));

    await query(
      `INSERT INTO ai_providers (name, type, api_key_encrypted, base_url, models, enabled, priority)
       VALUES ($1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         api_key_encrypted = $2,
         base_url = $3,
         models = $4,
         enabled = $5,
         priority = $6,
         updated_at = NOW()`,
      [
        provider.name,
        encryptedKey,
        provider.baseUrl,
        JSON.stringify(provider.models),
        provider.enabled,
        provider.priority,
      ]
    );
  }

  logger.info(`Configured ${providers.length} AI providers`);
}

export async function testProviders(): Promise<{ name: string; success: boolean; error?: string }[]> {
  const providers = await query('SELECT * FROM ai_providers WHERE enabled = true');
  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const provider of providers.rows) {
    try {
      const start = Date.now();
      const response = await fetch(`${provider.base_url}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${decrypt(JSON.parse(provider.api_key_encrypted))}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      const success = response.ok;
      const latency = Date.now() - start;

      await query(
        `UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2`,
        [success ? 'healthy' : 'degraded', provider.id]
      );

      results.push({ name: provider.name, success });
    } catch (error) {
      await query(
        `UPDATE ai_providers SET health_status = 'unhealthy', last_health_check = NOW() WHERE id = $1`,
        [provider.id]
      );

      results.push({
        name: provider.name,
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }

  return results;
}

export async function createFirstOrganization(data: { name: string; slug: string }, userId: string): Promise<Organization> {
  const existing = await query('SELECT id FROM organizations WHERE deleted_at IS NULL');
  if (existing.rows.length > 0) {
    throw new AppError(400, 'Organization already exists', 'ORG_EXISTS');
  }

  const result = await query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     RETURNING *`,
    [data.name, data.slug]
  );

  await query(
    `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
     VALUES ($1, $2, 'owner', $2)`,
    [result.rows[0].id, userId]
  );

  logger.info(`First organization created: ${data.slug}`);
  return result.rows[0];
}

export async function complete(): Promise<void> {
  await query(
    `INSERT INTO system_settings (key, value)
     VALUES ('onboarding_complete', '{"value": true}')
     ON CONFLICT (key) DO UPDATE SET value = '{"value": true}', updated_at = NOW()`
  );

  logger.info('Onboarding completed');
}
