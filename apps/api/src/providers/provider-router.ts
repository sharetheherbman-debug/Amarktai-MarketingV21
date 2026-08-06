import { query } from '../config/database';
import { decrypt, encrypt } from '../utils/encryption';
import { GenXProvider } from './genx.provider';
import { TogetherProvider } from './together.provider';
import { DeepInfraProvider } from './deepinfra.provider';
import { ChatMessage, ChatOptions, ChatResult, EmbeddingResult, ProviderInterface, ProviderHealth, HealthStatus } from '../types';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import * as usageService from '../services/usage.service';

type ProviderType = 'genx' | 'together' | 'deepinfra';

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

export class ProviderRouter {
  private providers: Map<string, ProviderInstance> = new Map();

  private async upsertEnvironmentProvider(
    name: ProviderType,
    apiKey: string,
    baseUrl: string,
    priority: number
  ): Promise<void> {
    if (!apiKey) return;
    const encryptedKey = JSON.stringify(encrypt(apiKey));
    await query(
      `INSERT INTO ai_providers
         (name, type, api_key_encrypted, base_url, models, enabled, priority, health_status)
       VALUES ($1,$1,$2,$3,'[]'::jsonb,TRUE,$4,'unknown')
       ON CONFLICT (name) DO UPDATE SET
         type = EXCLUDED.type,
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         base_url = EXCLUDED.base_url,
         enabled = TRUE,
         priority = EXCLUDED.priority,
         updated_at = NOW()`,
      [name, encryptedKey, baseUrl.replace(/\/$/, ''), priority]
    );
  }

  private async syncEnvironmentProviders(): Promise<void> {
    await this.upsertEnvironmentProvider('genx', env.GENX_API_KEY, env.GENX_BASE_URL, 100);
    await this.upsertEnvironmentProvider('together', env.TOGETHER_API_KEY, env.TOGETHER_BASE_URL, 50);
    await this.upsertEnvironmentProvider('deepinfra', env.DEEPINFRA_API_KEY, env.DEEPINFRA_BASE_URL, 40);
  }

  async loadProviders(): Promise<void> {
    await this.syncEnvironmentProviders();
    this.providers.clear();

    const result = await query('SELECT * FROM ai_providers WHERE enabled = true ORDER BY priority DESC, created_at ASC');
    const loadedTypes = new Set<ProviderType>();

    for (const row of result.rows) {
      try {
        const type = String(row.type || row.name).toLowerCase() as ProviderType;
        if (!['genx', 'together', 'deepinfra'].includes(type)) {
          logger.warn(`Skipping unsupported provider type: ${row.type}`);
          continue;
        }
        if (loadedTypes.has(type)) {
          logger.warn(`Skipping duplicate enabled ${type} provider ${row.name}; highest-priority provider is already loaded`);
          continue;
        }

        const apiKey = decrypt(JSON.parse(row.api_key_encrypted));
        const provider = this.createProviderInstance(type, { apiKey, baseUrl: String(row.base_url).replace(/\/$/, '') });
        this.providers.set(String(row.id), {
          id: String(row.id),
          name: String(row.name),
          type,
          provider,
          priority: Number(row.priority || 0),
          enabled: row.enabled !== false,
          healthStatus: (row.health_status || 'unknown') as HealthStatus,
        });
        loadedTypes.add(type);
      } catch (error) {
        logger.error(`Failed to load provider ${row.name}: ${error}`);
      }
    }

    if (![...this.providers.values()].some((provider) => provider.type === 'genx')) {
      throw new Error('GenX provider could not be loaded from GENX_API_KEY');
    }
  }

  private createProviderInstance(type: ProviderType, config: { apiKey: string; baseUrl: string }): ProviderInterface {
    switch (type) {
      case 'genx':
        return new GenXProvider(config);
      case 'together':
        return new TogetherProvider(config);
      case 'deepinfra':
        return new DeepInfraProvider(config);
    }
  }

  private resolveChatModel(instance: ProviderInstance, requestedModel?: string): string {
    const requested = String(requestedModel || '').trim();
    if (instance.type === 'genx') {
      return LEGACY_GENX_MODELS.has(requested.toLowerCase()) ? env.DEFAULT_TEXT_MODEL : requested;
    }

    const supported = instance.provider.getModels();
    if (requested && supported.includes(requested)) return requested;
    return instance.type === 'together'
      ? env.TOGETHER_DEFAULT_TEXT_MODEL
      : env.DEEPINFRA_DEFAULT_TEXT_MODEL;
  }

  async routeRequest(
    messages: ChatMessage[],
    model: string,
    options?: ChatOptions,
    context?: { organizationId?: string; userId?: string }
  ): Promise<ChatResult> {
    const provider = await this.selectProvider(model);
    if (!provider) throw new Error('No available AI provider');

    const resolvedModel = this.resolveChatModel(provider, model);
    try {
      const result = await provider.provider.chat(messages, resolvedModel, options);
      await this.recordUsage(provider, resolvedModel, result, context);
      return result;
    } catch (error) {
      logger.error(`Provider ${provider.name} failed for ${resolvedModel}: ${error}`);
      return this.failover(provider.id, messages, model, options, context);
    }
  }

  async selectProvider(model?: string): Promise<ProviderInstance | null> {
    const available = Array.from(this.providers.values())
      .filter((provider) => provider.enabled && provider.healthStatus !== 'unhealthy')
      .sort((left, right) => right.priority - left.priority);
    if (available.length === 0) return null;

    const requested = String(model || '').trim();
    if (requested) {
      const exact = available.find((provider) => provider.provider.getModels().includes(requested));
      if (exact) return exact;
    }

    return available.find((provider) => provider.type === 'genx') || available[0];
  }

  async failover(
    failedProviderId: string,
    messages: ChatMessage[],
    requestedModel: string,
    options?: ChatOptions,
    context?: { organizationId?: string; userId?: string }
  ): Promise<ChatResult> {
    const available = Array.from(this.providers.values())
      .filter((provider) => provider.id !== failedProviderId && provider.enabled && provider.healthStatus !== 'unhealthy')
      .sort((left, right) => right.priority - left.priority);

    const failures: string[] = [];
    for (const provider of available) {
      const resolvedModel = this.resolveChatModel(provider, requestedModel);
      try {
        const result = await provider.provider.chat(messages, resolvedModel, options);
        await this.recordUsage(provider, resolvedModel, result, context);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider.name}: ${message}`);
        logger.error(`Failover provider ${provider.name} failed for ${resolvedModel}: ${message}`);
      }
    }

    throw new Error(`All AI providers failed${failures.length ? ` (${failures.join('; ')})` : ''}`);
  }

  private async recordUsage(
    provider: ProviderInstance,
    model: string,
    result: ChatResult,
    context?: { organizationId?: string; userId?: string }
  ): Promise<void> {
    if (!context?.organizationId) return;
    const costCents = usageService.estimateCost(provider.name, model, result.tokensIn, result.tokensOut);
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
      logger.error(`Failed to track usage: ${error}`);
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
        await query('UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2', [status, id]);
        instance.healthStatus = status;
        results.push({ name: instance.name, status, latency, lastCheck: new Date() });
      } catch (error) {
        const latency = Date.now() - start;
        await query("UPDATE ai_providers SET health_status = 'unhealthy', last_health_check = NOW() WHERE id = $1", [id]);
        instance.healthStatus = 'unhealthy';
        results.push({
          name: instance.name,
          status: 'unhealthy',
          latency,
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    return results;
  }

  async embeddings(input: string | string[], requestedModel?: string): Promise<EmbeddingResult[]> {
    const available = Array.from(this.providers.values())
      .filter((provider) => provider.enabled && provider.healthStatus !== 'unhealthy' && provider.type !== 'genx')
      .sort((left, right) => right.priority - left.priority);
    const failures: string[] = [];

    for (const provider of available) {
      const configuredModel = provider.type === 'together'
        ? env.TOGETHER_EMBEDDING_MODEL
        : env.DEEPINFRA_EMBEDDING_MODEL;
      const model = String(requestedModel || configuredModel || '').trim();
      if (!model) continue;
      try {
        return await provider.provider.embeddings(input, model);
      } catch (error) {
        failures.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`No working external embedding provider is configured${failures.length ? ` (${failures.join('; ')})` : ''}`);
  }
}

export const providerRouter = new ProviderRouter();
