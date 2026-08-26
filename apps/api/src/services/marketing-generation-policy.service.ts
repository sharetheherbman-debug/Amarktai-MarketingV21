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
  selectionReasoning: {
    policy: MarketingGenerationTier;
    selectedScore: number;
    summary: string;
    weights: Record<string, number>;
    selectedSignals: Record<string, number | boolean | string>;
    candidatesConsidered: number;
  };
}

export type PricedCandidate = Omit<MarketingGenerationRoute, 'selectionReasoning'> & {
  runtimeConfirmed: boolean;
  healthScore: number;
  failureRate: number;
  qualityScore: number;
  latencyMs: number;
};

type ScoredCandidate = { candidate: PricedCandidate; score: number; signals: Record<string, number> };

function numberInRange(value: unknown, fallback: number, min = 0, max = 100): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function candidateSignals(raw: Record<string, unknown> | undefined): Pick<PricedCandidate, 'healthScore' | 'failureRate' | 'qualityScore' | 'latencyMs'> {
  const metadata = raw || {};
  return {
    healthScore: numberInRange(metadata.runtime_health_score ?? metadata.health_score, 80),
    failureRate: numberInRange(metadata.recent_failure_rate ?? metadata.failure_rate, 0),
    qualityScore: numberInRange(metadata.marketing_visual_qa_score ?? metadata.recent_campaign_visual_qa_score, 50),
    latencyMs: numberInRange(metadata.average_latency_ms ?? metadata.latency_ms, 0, 120000),
  };
}

function supportsRequestedFormat(raw: Record<string, unknown> | undefined, requiredFormat?: string): boolean {
  if (!requiredFormat) return true;
  const formats = raw?.supported_dimensions ?? raw?.supported_formats;
  if (!Array.isArray(formats) || formats.length === 0) return true;
  return formats.map(String).includes(requiredFormat);
}

export function rankMarketingCandidates(tier: MarketingGenerationTier, candidates: PricedCandidate[]): ScoredCandidate[] {
  const priceSorted = [...candidates].sort((left, right) => left.estimatedCredits - right.estimatedCredits || left.modelId.localeCompare(right.modelId));
  if (tier === 'economy') return priceSorted.map((candidate, index) => ({
    candidate,
    score: Number((100 - index).toFixed(2)),
    signals: { safe_cost_rank: index + 1 },
  }));
  const minCredits = priceSorted[0].estimatedCredits;
  const maxCredits = priceSorted[priceSorted.length - 1].estimatedCredits;
  return candidates.map((candidate) => {
    const costScore = maxCredits === minCredits ? 100 : 100 - (((candidate.estimatedCredits - minCredits) / (maxCredits - minCredits)) * 100);
    const latencyScore = candidate.latencyMs <= 0 ? 70 : Math.max(0, 100 - Math.min(100, candidate.latencyMs / 100));
    const reliabilityScore = 100 - candidate.failureRate;
    const score = tier === 'premium'
      ? (candidate.healthScore * 0.30) + (reliabilityScore * 0.30) + (candidate.qualityScore * 0.35) + (latencyScore * 0.05)
      : (candidate.healthScore * 0.20) + (reliabilityScore * 0.25) + (candidate.qualityScore * 0.30) + (latencyScore * 0.05) + (costScore * 0.20);
    return { candidate, score: Number(score.toFixed(2)), signals: { cost: Number(costScore.toFixed(2)), health: candidate.healthScore, reliability: reliabilityScore, historical_quality: candidate.qualityScore, latency: Number(latencyScore.toFixed(2)) } };
  }).sort((left, right) => right.score - left.score || left.candidate.estimatedCredits - right.candidate.estimatedCredits || left.candidate.modelId.localeCompare(right.candidate.modelId));
}

function chooseCandidate(tier: MarketingGenerationTier, candidates: PricedCandidate[]): { candidate: PricedCandidate; reasoning: MarketingGenerationRoute['selectionReasoning'] } {
  const ranked = rankMarketingCandidates(tier, candidates);
  const selected = ranked[0];
  const weights: Record<string, number> = tier === 'economy'
    ? { safe_cost_rank: 1 }
    : tier === 'premium'
      ? { health: 0.30, reliability: 0.30, historical_quality: 0.35, latency: 0.05, cost: 0 }
      : { health: 0.20, reliability: 0.25, historical_quality: 0.30, latency: 0.05, cost: 0.20 };
  return {
    candidate: selected.candidate,
    reasoning: {
      policy: tier,
      selectedScore: selected.score,
      summary: tier === 'economy'
        ? 'Lowest-credit runtime-confirmed route satisfying operation, format and live-pricing gates.'
        : tier === 'premium'
          ? 'Highest quality/reliability score among explicitly permitted safe routes.'
          : 'Best-value weighted score using runtime health, observed failure rate, available QA history, latency and live cost.',
      weights,
      selectedSignals: { ...selected.signals, runtime_confirmed: true, required_format: selected.candidate.requiredFormat || 'not specified' },
      candidatesConsidered: ranked.length,
    },
  };
}

function normalizeTier(value: unknown): MarketingGenerationTier {
  const tier = String(value || 'recommended').toLowerCase();
  if (tier === 'economy' || tier === 'recommended' || tier === 'premium') return tier;
  throw new AppError(400, 'Marketing generation tier must be Economy, Recommended, or Premium', 'MARKETING_TIER_INVALID');
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
    if (!supportsRequestedFormat(model.raw_metadata, input.requiredFormat)) continue;
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
        ...candidateSignals(model.raw_metadata),
      });
    } catch {
      // Missing, stale, or ambiguous prices are never silently substituted.
    }
  }
  if (candidates.length === 0) {
    throw new AppError(503, `No live-priced, runtime-confirmed Marketing model is available for ${input.operation}`, 'MARKETING_MODEL_ROUTE_UNAVAILABLE');
  }

  const selection = chooseCandidate(tier, candidates);
  const selected = selection.candidate;
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
  return { ...route, selectionReasoning: selection.reasoning };
}
