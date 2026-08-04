import { query } from '../config/database';
import { decrypt } from '../utils/encryption';
import { GenXProvider } from './genx.provider';
import { TogetherProvider } from './together.provider';
import { DeepInfraProvider } from './deepinfra.provider';
import { AIProvider, ChatMessage, ChatOptions, ChatResult, EmbeddingResult, ProviderInterface, ProviderHealth, HealthStatus } from '../types';
import { logger } from '../utils/logger';
import * as usageService from '../services/usage.service';

interface ProviderInstance {
  id: string;
  name: string;
  provider: ProviderInterface;
  priority: number;
  enabled: boolean;
  healthStatus: HealthStatus;
}

export class ProviderRouter {
  private providers: Map<string, ProviderInstance> = new Map();

  async loadProviders(): Promise<void> {
    const result = await query('SELECT * FROM ai_providers WHERE enabled = true ORDER BY priority DESC');

    for (const row of result.rows) {
      try {
        const apiKey = decrypt(JSON.parse(row.api_key_encrypted));
        const provider = this.createProviderInstance(row.type, { apiKey, baseUrl: row.base_url });

        this.providers.set(row.id, {
          id: row.id,
          name: row.name,
          provider,
          priority: row.priority,
          enabled: row.enabled,
          healthStatus: row.health_status || 'unknown',
        });
      } catch (error) {
        logger.error(`Failed to load provider ${row.name}: ${error}`);
      }
    }
  }

  private createProviderInstance(type: string, config: { apiKey: string; baseUrl: string }): ProviderInterface {
    switch (type) {
      case 'genx':
        return new GenXProvider(config);
      case 'together':
        return new TogetherProvider(config);
      case 'deepinfra':
        return new DeepInfraProvider(config);
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  async routeRequest(
    messages: ChatMessage[],
    model: string,
    options?: ChatOptions,
    context?: { organizationId?: string; userId?: string }
  ): Promise<ChatResult> {
    const provider = await this.selectProvider(model);
    if (!provider) {
      throw new Error('No available provider for the requested model');
    }

    try {
      const result = await provider.provider.chat(messages, model, options);
      const costCents = usageService.estimateCost(provider.name, model, result.tokensIn, result.tokensOut);

      if (context?.organizationId) {
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

      return result;
    } catch (error) {
      logger.error(`Provider ${provider.name} failed: ${error}`);
      return this.failover(provider.id, messages, model, options, context);
    }
  }

  async selectProvider(model?: string): Promise<ProviderInstance | null> {
    const available = Array.from(this.providers.values())
      .filter((p) => p.enabled && p.healthStatus !== 'unhealthy')
      .sort((a, b) => b.priority - a.priority);

    if (available.length === 0) {
      return null;
    }

    if (model) {
      const withModel = available.filter((p) => p.provider.getModels().includes(model));
      if (withModel.length > 0) {
        return withModel[0];
      }
    }

    return available[0];
  }

  async failover(
    failedProviderId: string,
    messages: ChatMessage[],
    model: string,
    options?: ChatOptions,
    context?: { organizationId?: string; userId?: string }
  ): Promise<ChatResult> {
    const available = Array.from(this.providers.values())
      .filter((p) => p.id !== failedProviderId && p.enabled && p.healthStatus !== 'unhealthy')
      .sort((a, b) => b.priority - a.priority);

    for (const provider of available) {
      try {
        const result = await provider.provider.chat(messages, model, options);
        const costCents = usageService.estimateCost(provider.name, model, result.tokensIn, result.tokensOut);

        if (context?.organizationId) {
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

        return result;
      } catch (error) {
        logger.error(`Failover provider ${provider.name} failed: ${error}`);
        continue;
      }
    }

    throw new Error('All providers failed');
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
      await usageService.track({
        organizationId: data.organizationId,
        userId: data.userId,
        providerId: data.providerId,
        model: data.model,
        action: data.action,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        costCents: data.costCents,
      });

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
        await query(
          'UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2',
          [status, id]
        );

        instance.healthStatus = status;

        results.push({
          name: instance.name,
          status,
          latency,
          lastCheck: new Date(),
        });
      } catch (error) {
        const latency = Date.now() - start;
        await query(
          'UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2',
          ['unhealthy', id]
        );

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

  async embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]> {
    const provider = await this.selectProvider(model);
    if (!provider) {
      throw new Error('No available provider for embeddings');
    }
    return provider.provider.embeddings(input, model);
  }
}

export const providerRouter = new ProviderRouter();
