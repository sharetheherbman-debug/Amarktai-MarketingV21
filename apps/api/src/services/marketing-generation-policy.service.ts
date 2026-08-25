import { AppError } from '../middleware/errorHandler';
import * as pricing from './genx-pricing.service';
import * as registry from './genx-model-registry.service';
import { getControlCentre } from './relaunch-control.service';
import type { MarketingGenerationOperation } from './marketing-deliverable-registry.service';

export type MarketingGenerationTier = 'economy' | 'recommended' | 'premium';

export interface MarketingGenerationRouteInput {
  organizationId: string;
  operation: MarketingGenerationOperation;
  tier?: MarketingGenerationTier;
  quantity?: number;
  /** The plan ceiling is checked before queueing; the execution gate rechecks it atomically. */
  campaignCreditLimit?: number;
  /** Premium is never an implicit fallback. A trusted owner-approved plan must opt in. */
  premiumPermitted?: boolean;
  requiredFormat?: string;
}

export interface MarketingGenerationRoute {
  modelId: string;
  tier: MarketingGenerationTier;
  operation: MarketingGenerationOperation;
  estimatedCredits: number;
  estimatedRetailGbp: number;
  priceSnapshotId: string;
  pricingLastSyncedAt: string;
  requiredFormat?: string;
}

type PricedCandidate = MarketingGenerationRoute & { runtimeConfirmed: boolean };

function normalizeTier(value: unknown): MarketingGenerationTier {
  const tier = String(value || 'recommended').toLowerCase();
  if (tier === 'economy' || tier === 'recommended' || tier === 'premium') return tier;
  throw new AppError(400, 'Marketing generation tier must be Economy, Recommended, or Premium', 'MARKETING_TIER_INVALID');
}

function selectedIndex(tier: MarketingGenerationTier, count: number): number {
  if (tier === 'economy') return 0;
  if (tier === 'premium') return count - 1;
  return Math.floor((count - 1) * 0.5);
}

/**
 * Selects a Marketing production model by a stable cost/id ordering. This is
 * deliberately separate from the advanced Studio API: normal campaign and
 * Growth Director paths must always provide the returned explicit model ID.
 */
export async function routeMarketingGeneration(input: MarketingGenerationRouteInput): Promise<MarketingGenerationRoute> {
  const tier = normalizeTier(input.tier);
  const quantity = Math.max(1, Number(input.quantity || 1));
  if (!Number.isFinite(quantity)) {
    throw new AppError(400, 'Marketing generation quantity must be finite', 'MARKETING_QUANTITY_INVALID');
  }
  if (tier === 'premium' && input.premiumPermitted !== true) {
    throw new AppError(403, 'Premium Marketing production requires explicit owner permission', 'MARKETING_PREMIUM_NOT_PERMITTED');
  }

  const control = await getControlCentre(input.organizationId);
  const policy = (control.policy || control) as Record<string, unknown>;
  const allowedChannels = Array.isArray(policy.allowed_channels) ? policy.allowed_channels.map(String) : [];
  if (policy.emergency_stop === true) {
    throw new AppError(409, 'Marketing production is stopped by the owner Emergency Stop', 'MARKETING_EMERGENCY_STOP');
  }
  if (allowedChannels.length > 0 && !allowedChannels.includes('content')) {
    throw new AppError(403, 'Marketing production is not permitted by the current Control Centre channels', 'MARKETING_CONTENT_CHANNEL_BLOCKED');
  }

  let models = await registry.getAvailableModels(input.operation);
  if (models.length === 0) {
    const live = await registry.fetchLiveModelCatalogue();
    if (live.length > 0) await registry.syncModelsToDatabase(live);
    models = await registry.getAvailableModels(input.operation);
  }
  const candidates: PricedCandidate[] = [];
  for (const model of models) {
    // Auto-routing is fail-closed: a catalogue entry is not healthy enough
    // until a runtime probe has confirmed it, regardless of its display order.
    if (model.available === false || model.deprecated === true || model.verification_status !== 'runtime_confirmed') continue;
    if (!(model.operations || []).includes(input.operation)) continue;
    try {
      const quote = await pricing.quoteGeneration({
        modelId: model.id,
        operation: input.operation,
        quantity,
      });
      candidates.push({
        modelId: model.id,
        tier,
        operation: input.operation,
        estimatedCredits: quote.reservation_credits,
        estimatedRetailGbp: quote.retail_charge_gbp,
        priceSnapshotId: quote.price_snapshot_id,
        pricingLastSyncedAt: quote.pricing_last_synced_at,
        requiredFormat: input.requiredFormat,
        runtimeConfirmed: true,
      });
    } catch {
      // Missing, stale, or ambiguous prices are never silently substituted.
    }
  }
  if (candidates.length === 0) {
    throw new AppError(503, `No live-priced, runtime-confirmed Marketing model is available for ${input.operation}`, 'MARKETING_MODEL_ROUTE_UNAVAILABLE');
  }

  candidates.sort((left, right) => left.estimatedCredits - right.estimatedCredits || left.modelId.localeCompare(right.modelId));
  const selected = candidates[selectedIndex(tier, candidates.length)];
  const perActionLimit = Number(policy.per_action_credit_limit || 0);
  const dailyLimit = Number(policy.daily_generation_credit_limit || 0);
  const remainingToday = Number((control.today as Record<string, unknown> | undefined)?.generation_credits_remaining || 0);
  const campaignLimit = Number(input.campaignCreditLimit || 0);
  if (campaignLimit > 0 && selected.estimatedCredits > campaignLimit) {
    throw new AppError(409, 'Selected Marketing route exceeds the campaign generation-credit limit', 'MARKETING_CAMPAIGN_CREDIT_LIMIT');
  }
  if (perActionLimit > 0 && selected.estimatedCredits > perActionLimit) {
    throw new AppError(409, 'Selected Marketing route exceeds the owner per-action credit limit', 'MARKETING_ACTION_CREDIT_LIMIT');
  }
  if (dailyLimit > 0 && selected.estimatedCredits > remainingToday) {
    throw new AppError(409, 'Selected Marketing route exceeds the owner daily generation-credit limit', 'MARKETING_DAILY_CREDIT_LIMIT');
  }

  const { runtimeConfirmed: _runtimeConfirmed, ...route } = selected;
  return route;
}
