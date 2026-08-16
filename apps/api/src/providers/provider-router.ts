import { query } from '../config/database';
import { decrypt, encrypt } from '../utils/encryption';
import { GenXProvider } from './genx.provider';
import {
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbeddingResult,
  ProviderHealth,
  ProviderInterface,
  HealthStatus,
} from '../types';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import * as usageService from '../services/usage.service';

type ProviderType = 'genx';

interface ProviderInstance {
  id: string;
  name: string;
  type: ProviderType;
  provider: ProviderInterface;
  priority: number;
  enabled: boolean;
  healthStatus: HealthStatus;
}

const LEGACY_GENX_MODELS = new Set([
  '',
  'default',
  'gpt-4',
  'gpt-4-turbo',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-3.5-turbo',
]);

/**
 * Single-provider AI router.
 *
 * GenX is the only remote AI provider used by the marketing platform. The
 * provider key is sourced exclusively from the server environment and is never
 * accepted from a customer-facing settings page. Local deterministic services
 * such as PostgreSQL search and FFmpeg rendering remain separate platform
 * infrastructure and are not AI fallbacks.
 */
export class ProviderRouter {
  private providers: Map<string, ProviderInstance> = new Map();

  private async syncEnvironmentProvider(): Promise<void> {
    if (!env.GENX_API_KEY) {
      throw new Error('GENX_API_KEY is required');
    }

    const encryptedKey = JSON.stringify(encrypt(env.GENX_API_KEY));
    await query(
      `INSERT INTO ai_providers
         (name, type, api_key_encrypted, base_url, models, enabled, priority, health_status)
       VALUES ('genx','genx',$1,$2,'[]'::jsonb,TRUE,100,'unknown')
       ON CONFLICT (name) DO UPDATE SET
         type = 'genx',
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         base_url = EXCLUDED.base_url,
         enabled = TRUE,
         priority = 100,
         updated_at = NOW()`,
      [encryptedKey, env.GENX_BASE_URL.replace(/\/$/, '')]
    );

    // Historical provider rows may remain for audit purposes, but they must not
    // be selectable by the runtime once the GenX-only policy is active.
    await query(
      `UPDATE ai_providers
       SET enabled=FALSE, updated_at=NOW()
       WHERE LOWER(name) <> 'genx' OR LOWER(type) <> 'genx'`
    );
  }

  async loadProviders(): Promise<void> {
    await this.syncEnvironmentProvider();
    this.providers.clear();

    const result = await query(
      `SELECT * FROM ai_providers
       WHERE enabled=TRUE AND LOWER(name)='genx' AND LOWER(type)='genx'
       ORDER BY priority DESC, created_at ASC
       LIMIT 1`
    );

    for (const row of result.rows) {
      try {
        const apiKey = decrypt(JSON.parse(row.api_key_encrypted));
        const provider = new GenXProvider({
          apiKey,
          baseUrl: String(row.base_url).replace(/\/$/, ''),
        });

        this.providers.set(String(row.id), {
          id: String(row.id),
          name: 'genx',
          type: 'genx',
          provider,
          priority: 100,
          enabled: row.enabled !== false,
          healthStatus: (row.health_status || 'unknown') as HealthStatus,
        });
      } catch (error) {
        logger.error(`Failed to load GenX provider: ${error}`);
      }
    }

    if (this.providers.size !== 1) {
      throw new Error('GenX provider could not be loaded from GENX_API_KEY');
    }
  }

  private resolveChatModel(requestedModel?: string): string {
    const requested = String(requestedModel || '').trim();
    return LEGACY_GENX_MODELS.has(requested.toLowerCase())
      ? env.DEFAULT_TEXT_MODEL
      : requested;
  }

  async routeRequest(
    messages: ChatMessage[],
    model: string,
    options?: ChatOptions,
    context?: { organizationId?: string; userId?: string }
  ): Promise<ChatResult> {
    const provider = await this.selectProvider();
    if (!provider) {
      throw new Error('GenX is not available');
    }

    const resolvedModel = this.resolveChatModel(model);
    try {
      const result = await provider.provider.chat(messages, resolvedModel, options);
      await this.recordUsage(provider, resolvedModel, result, context);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`GenX failed for ${resolvedModel}: ${message}`);
      throw new Error(`GenX request failed: ${message}`);
    }
  }

  async selectProvider(_model?: string): Promise<ProviderInstance | null> {
    return Array.from(this.providers.values()).find(
      (provider) =>
        provider.enabled &&
        provider.type === 'genx' &&
        provider.healthStatus !== 'unhealthy'
    ) || null;
  }

  private async recordUsage(
    provider: ProviderInstance,
    model: string,
    result: ChatResult,
    context?: { organizationId?: string; userId?: string }
  ): Promise<void> {
    if (!context?.organizationId) return;
    const costCents = usageService.estimateCost(
      'genx',
      model,
      result.tokensIn,
      result.tokensOut
    );

    await this.trackUsage({
      organizationId: context.organizationId,
      userId: context.userId,
      providerId: provider.id,
      model,
      action: 'chat',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costCents,
    });
  }

  async trackUsage(data: {
    organizationId: string;
    userId?: string;
    providerId: string;
    model: string;
    action: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
  }): Promise<void> {
    try {
      await usageService.track(data);
      await query(
        `UPDATE ai_providers
         SET usage_stats = jsonb_set(
           COALESCE(usage_stats, '{}'),
           '{total_requests}',
           (COALESCE(usage_stats->>'total_requests', '0')::int + 1)::text::jsonb
         )
         WHERE id = $1`,
        [data.providerId]
      );
    } catch (error) {
      logger.error(`Failed to track GenX usage: ${error}`);
    }
  }

  async getHealthStatus(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];

    for (const [id, instance] of this.providers) {
      const start = Date.now();
      try {
        const healthy = await instance.provider.healthCheck();
        const latency = Date.now() - start;
        const status: HealthStatus = healthy ? 'healthy' : 'degraded';
        await query(
          'UPDATE ai_providers SET health_status=$1,last_health_check=NOW() WHERE id=$2',
          [status, id]
        );
        instance.healthStatus = status;
        results.push({ name: 'genx', status, latency, lastCheck: new Date() });
      } catch (error) {
        const latency = Date.now() - start;
        await query(
          "UPDATE ai_providers SET health_status='unhealthy',last_health_check=NOW() WHERE id=$1",
          [id]
        );
        instance.healthStatus = 'unhealthy';
        results.push({
          name: 'genx',
          status: 'unhealthy',
          latency,
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  async embeddings(
    _input: string | string[],
    _requestedModel?: string
  ): Promise<EmbeddingResult[]> {
    throw new Error(
      'Remote embeddings are disabled in GenX-only mode; use the platform local embeddings service'
    );
  }
}

export const providerRouter = new ProviderRouter();
