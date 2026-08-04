import { query } from '../config/database';
import redis from '../config/redis';
import { logger } from '../utils/logger';
import { SystemSetting } from '../types';

const CACHE_PREFIX = 'config:';
const CACHE_TTL = 3600;

interface AppConfig {
  app_url: string;
  ssl_enabled: boolean;
  trusted_domains: string[];
  [key: string]: unknown;
}

interface ProviderConfigEntry {
  name: string;
  enabled: boolean;
  health_status: string;
  models: string[];
  [key: string]: unknown;
}

class ConfigService {
  async get(key: string): Promise<unknown | null> {
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);
    if (cached) {
      logger.debug(`Config cache hit: ${key}`);
      return JSON.parse(cached);
    }

    logger.debug(`Config cache miss: ${key}`);
    const result = await query(
      'SELECT value FROM system_settings WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const value = result.rows[0].value;
    await redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(value));

    return value;
  }

  async set(key: string, value: unknown, updatedBy?: string): Promise<void> {
    await query(
      `INSERT INTO system_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [key, JSON.stringify(value), updatedBy || null]
    );

    await redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(value));
    logger.info(`Config set: ${key}`);
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    const cachedResults = await Promise.all(
      keys.map((key) => redis.get(`${CACHE_PREFIX}${key}`))
    );

    const missingKeys: string[] = [];
    keys.forEach((key, index) => {
      if (cachedResults[index]) {
        result[key] = JSON.parse(cachedResults[index]!);
      } else {
        missingKeys.push(key);
      }
    });

    if (missingKeys.length > 0) {
      const dbResult = await query(
        'SELECT key, value FROM system_settings WHERE key = ANY($1)',
        [missingKeys]
      );

      for (const row of dbResult.rows) {
        result[row.key] = row.value;
        await redis.setex(`${CACHE_PREFIX}${row.key}`, CACHE_TTL, JSON.stringify(row.value));
      }

      for (const key of missingKeys) {
        if (!(key in result)) {
          result[key] = null;
        }
      }
    }

    return result;
  }

  async setMany(entries: Record<string, unknown>, updatedBy?: string): Promise<void> {
    const keys = Object.keys(entries);
    if (keys.length === 0) return;

    for (const key of keys) {
      await query(
        `INSERT INTO system_settings (key, value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, JSON.stringify(entries[key]), updatedBy || null]
      );

      await redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(entries[key]));
    }

    logger.info(`Config set many: ${keys.join(', ')}`);
  }

  async getAppConfig(): Promise<AppConfig | null> {
    const config = await this.get('app_config');
    return (config as AppConfig) || null;
  }

  async getProviderConfig(): Promise<ProviderConfigEntry[]> {
    const result = await query(
      'SELECT name, enabled, health_status, models FROM ai_providers ORDER BY priority DESC'
    );
    return result.rows;
  }

  async isOnboardingComplete(): Promise<boolean> {
    const result = await this.get('onboarding_complete');
    if (result && typeof result === 'object' && 'value' in (result as Record<string, unknown>)) {
      return (result as Record<string, unknown>).value === true;
    }
    return false;
  }

  async clearCache(pattern?: string): Promise<void> {
    const searchPattern = pattern ? `${CACHE_PREFIX}${pattern}*` : `${CACHE_PREFIX}*`;

    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', searchPattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    logger.info(`Cleared ${deletedCount} config cache entries${pattern ? ` matching "${pattern}"` : ''}`);
  }
}

const configService = new ConfigService();

export default configService;
