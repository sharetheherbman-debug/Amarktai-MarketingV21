import { query, transaction } from '../config/database';
import { env } from '../config/env';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import type { GenXModel } from './genx-model-registry.service';

export interface ExtractedPriceComponent {
  operation: string;
  billableUnit: string;
  sourceCurrency: string;
  sourceUnitCost: number;
  agentTierApplied: boolean;
  rawMetadata: Record<string, unknown>;
}

export interface GenXPriceQuote {
  model_id: string;
  operation: string;
  billable_unit: string;
  quantity: number;
  currency: 'GBP';
  wholesale_cost_gbp: number;
  retail_charge_gbp: number;
  base_credits: number;
  reservation_credits: number;
  target_margin_bps: number;
  price_snapshot_id: string;
  price_effective_from: string;
}

type PriceCandidate = {
  keys: string[];
  operation: string;
  unit: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim().replace(/[£$€,]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstNumber(
  source: Record<string, unknown>,
  keys: string[]
): { key: string; value: number } | null {
  for (const key of keys) {
    const value = parseNonNegativeNumber(source[key]);
    if (value !== null) return { key, value };
  }
  return null;
}

function firstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (currency === '$' || currency === 'US$') return 'USD';
  if (currency === '£') return 'GBP';
  if (currency === '€') return 'EUR';
  return currency || env.GENX_PRICING_SOURCE_CURRENCY;
}

function normalizeUnit(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const aliases: Record<string, string> = {
    token: 'token',
    tokens: 'token',
    per_token: 'token',
    thousand_tokens: 'thousand_tokens',
    '1k_tokens': 'thousand_tokens',
    per_1k_tokens: 'thousand_tokens',
    million_tokens: 'million_tokens',
    '1m_tokens': 'million_tokens',
    per_million_tokens: 'million_tokens',
    request: 'request',
    requests: 'request',
    generation: 'request',
    image: 'image',
    images: 'image',
    second: 'second',
    seconds: 'second',
    minute: 'minute',
    minutes: 'minute',
    character: 'character',
    characters: 'character',
  };
  return aliases[normalized] || normalized;
}

function pricingContainer(raw: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['agent_pricing', 'pricing', 'billing', 'rate_card', 'rates']) {
    const candidate = objectValue(raw[key]);
    if (Object.keys(candidate).length > 0) return candidate;
  }
  return raw;
}

function sourceCurrency(
  container: Record<string, unknown>,
  raw: Record<string, unknown>
): string {
  return normalizeCurrency(
    firstString(container, ['currency', 'billing_currency', 'price_currency']) ||
    firstString(raw, ['currency', 'billing_currency', 'price_currency']) ||
    env.GENX_PRICING_SOURCE_CURRENCY
  );
}

function sourceUnit(
  container: Record<string, unknown>,
  raw: Record<string, unknown>
): string {
  return normalizeUnit(
    firstString(container, ['unit', 'billing_unit', 'price_unit', 'per']) ||
    firstString(raw, ['unit', 'billing_unit', 'price_unit', 'per'])
  );
}

function isAgentPrice(key: string, raw: Record<string, unknown>, container: Record<string, unknown>): boolean {
  return Boolean(
    env.GENX_AGENT_TIER_ENABLED &&
    (
      key.includes('agent') ||
      key.includes('discount') ||
      raw.agent_tier === true ||
      container.agent_tier === true ||
      String(raw.tier || '').toLowerCase() === 'agent' ||
      'agent_pricing' in raw
    )
  );
}

function collectCandidates(
  source: Record<string, unknown>,
  candidates: PriceCandidate[],
  currency: string,
  raw: Record<string, unknown>,
  container: Record<string, unknown>
): ExtractedPriceComponent[] {
  const rows: ExtractedPriceComponent[] = [];
  for (const candidate of candidates) {
    const price = firstNumber(source, candidate.keys);
    if (!price) continue;
    rows.push({
      operation: candidate.operation,
      billableUnit: candidate.unit,
      sourceCurrency: currency,
      sourceUnitCost: price.value,
      agentTierApplied: isAgentPrice(price.key, raw, container),
      rawMetadata: raw,
    });
  }
  return rows;
}

/**
 * Reads only unambiguous prices from the authenticated GenX catalogue.
 * Models with no clear billable unit remain disabled rather than being treated
 * as free or charged from a guessed rate.
 */
export function extractPriceComponents(model: GenXModel): ExtractedPriceComponent[] {
  const raw = objectValue(model.raw_metadata || model.metadata || {});
  const container = pricingContainer(raw);
  const currency = sourceCurrency(container, raw);
  const primaryOperation = String(model.operations?.[0] || model.category || 'generation');

  const candidates: PriceCandidate[] = [
    {
      keys: [
        'agent_input_price_per_million_tokens',
        'discounted_input_price_per_million_tokens',
        'input_price_per_million_tokens',
        'input_cost_per_million_tokens',
      ],
      operation: 'text_input',
      unit: 'million_tokens',
    },
    {
      keys: [
        'agent_output_price_per_million_tokens',
        'discounted_output_price_per_million_tokens',
        'output_price_per_million_tokens',
        'output_cost_per_million_tokens',
      ],
      operation: 'text_output',
      unit: 'million_tokens',
    },
    {
      keys: [
        'agent_price_per_1k_tokens',
        'discounted_price_per_1k_tokens',
        'price_per_1k_tokens',
        'cost_per_1k_tokens',
      ],
      operation: 'text_generation',
      unit: 'thousand_tokens',
    },
    {
      keys: ['agent_price_per_image', 'discounted_price_per_image', 'price_per_image', 'cost_per_image'],
      operation: 'text_to_image',
      unit: 'image',
    },
    {
      keys: ['agent_price_per_video_second', 'discounted_price_per_video_second', 'price_per_video_second', 'video_cost_per_second'],
      operation: 'text_to_video',
      unit: 'second',
    },
    {
      keys: ['agent_price_per_audio_second', 'discounted_price_per_audio_second', 'price_per_audio_second', 'audio_cost_per_second'],
      operation: 'audio_generation',
      unit: 'second',
    },
    {
      keys: ['agent_price_per_voice_second', 'discounted_price_per_voice_second', 'price_per_voice_second', 'voice_cost_per_second'],
      operation: 'text_to_speech',
      unit: 'second',
    },
    {
      keys: ['agent_price_per_minute', 'discounted_price_per_minute', 'price_per_minute', 'cost_per_minute'],
      operation: primaryOperation,
      unit: 'minute',
    },
    {
      keys: ['agent_price_per_second', 'discounted_price_per_second', 'price_per_second', 'cost_per_second'],
      operation: primaryOperation,
      unit: 'second',
    },
    {
      keys: ['agent_price_per_request', 'discounted_price_per_request', 'price_per_request', 'cost_per_request'],
      operation: primaryOperation,
      unit: 'request',
    },
  ];

  const deduplicated = new Map<string, ExtractedPriceComponent>();
  for (const row of [
    ...collectCandidates(raw, candidates, currency, raw, container),
    ...collectCandidates(container, candidates, currency, raw, container),
  ]) {
    deduplicated.set(`${row.operation}:${row.billableUnit}`, row);
  }

  const unit = sourceUnit(container, raw);
  const input = firstNumber(container, ['agent_input', 'discounted_input', 'input', 'input_price', 'prompt']);
  const output = firstNumber(container, ['agent_output', 'discounted_output', 'output', 'output_price', 'completion']);

  if (unit && input) {
    deduplicated.set(`text_input:${unit}`, {
      operation: 'text_input',
      billableUnit: unit,
      sourceCurrency: currency,
      sourceUnitCost: input.value,
      agentTierApplied: isAgentPrice(input.key, raw, container),
      rawMetadata: raw,
    });
  }
  if (unit && output) {
    deduplicated.set(`text_output:${unit}`, {
      operation: 'text_output',
      billableUnit: unit,
      sourceCurrency: currency,
      sourceUnitCost: output.value,
      agentTierApplied: isAgentPrice(output.key, raw, container),
      rawMetadata: raw,
    });
  }

  const generic = firstNumber(container, [
    'agent_unit_cost',
    'agent_price',
    'discounted_price',
    'wholesale_price',
    'unit_cost',
    'amount',
    'price',
    'cost',
  ]);
  if (unit && generic) {
    const operations = model.operations?.length ? model.operations : [primaryOperation];
    for (const operation of operations) {
      const key = `${operation}:${unit}`;
      if (deduplicated.has(key)) continue;
      deduplicated.set(key, {
        operation,
        billableUnit: unit,
        sourceCurrency: currency,
        sourceUnitCost: generic.value,
        agentTierApplied: isAgentPrice(generic.key, raw, container),
        rawMetadata: raw,
      });
    }
  }

  return [...deduplicated.values()].filter(
    (row) => Boolean(row.operation) && Boolean(row.billableUnit) && row.sourceUnitCost >= 0
  );
}

function configuredFxRates(): Record<string, number> {
  let rawRates: Record<string, unknown>;
  try {
    rawRates = JSON.parse(env.GENX_FX_RATES_TO_GBP || '{}') as Record<string, unknown>;
  } catch {
    throw new AppError(500, 'GENX_FX_RATES_TO_GBP is not valid JSON', 'FX_CONFIG_INVALID');
  }

  const rates: Record<string, number> = { GBP: 1 };
  for (const [currency, rawRate] of Object.entries(rawRates)) {
    const rate = parseNonNegativeNumber(rawRate);
    if (rate !== null && rate > 0) rates[currency.toUpperCase()] = rate;
  }
  return rates;
}

export function convertToGbp(
  amount: number,
  sourceCurrencyCode: string
): { amountGbp: number; fxRate: number } {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError(400, 'Source price must be non-negative', 'GENX_PRICE_INVALID');
  }
  const currency = normalizeCurrency(sourceCurrencyCode);
  const rate = configuredFxRates()[currency];
  if (!rate) {
    throw new AppError(
      503,
      `No ${currency}-to-GBP conversion rate is configured`,
      'GBP_FX_RATE_REQUIRED'
    );
  }
  return { amountGbp: amount * rate, fxRate: rate };
}

export function retailFromWholesale(
  wholesaleGbp: number,
  marginBps = env.GENX_TARGET_MARGIN_BPS
): number {
  if (!Number.isFinite(wholesaleGbp) || wholesaleGbp < 0) {
    throw new AppError(400, 'Wholesale price must be non-negative', 'GENX_PRICE_INVALID');
  }
  const margin = marginBps / 10_000;
  if (margin < 0 || margin >= 1) {
    throw new AppError(500, 'Target margin must be below 100%', 'MARGIN_CONFIG_INVALID');
  }
  return wholesaleGbp / (1 - margin);
}

function creditsForGbp(amountGbp: number): number {
  return Math.max(1, Math.ceil(amountGbp * env.GENERATION_CREDITS_PER_GBP));
}

function sameNumber(left: unknown, right: number): boolean {
  const parsed = Number(left);
  return Number.isFinite(parsed) && Math.abs(parsed - right) < 0.00000001;
}

export async function syncPricingFromModels(models: GenXModel[]): Promise<{
  priced: number;
  unpriced: number;
  snapshotsCreated: number;
  errors: Array<{ model_id: string; error: string }>;
}> {
  let priced = 0;
  let unpriced = 0;
  let snapshotsCreated = 0;
  const errors: Array<{ model_id: string; error: string }> = [];

  for (const model of models) {
    try {
      const components = extractPriceComponents(model);
      if (components.length === 0) {
        unpriced += 1;
        await query(
          `UPDATE genx_models SET retail_enabled=FALSE,pricing_status='unpriced',
             pricing_last_synced_at=NOW(),
             pricing_error='No unambiguous GenX price and billable unit were found'
           WHERE id=$1`,
          [model.id]
        );
        continue;
      }

      await transaction(async (client) => {
        for (const component of components) {
          const converted = convertToGbp(component.sourceUnitCost, component.sourceCurrency);
          const retailGbp = retailFromWholesale(converted.amountGbp);
          const credits = creditsForGbp(retailGbp);
          const currentResult = await client.query(
            `SELECT * FROM genx_price_snapshots
             WHERE model_id=$1 AND operation=$2 AND effective_to IS NULL
             LIMIT 1 FOR UPDATE`,
            [model.id, component.operation]
          );
          const current = currentResult.rows[0];
          const unchanged = Boolean(
            current &&
            String(current.billable_unit) === component.billableUnit &&
            String(current.source_currency) === normalizeCurrency(component.sourceCurrency) &&
            sameNumber(current.source_unit_cost, component.sourceUnitCost) &&
            sameNumber(current.fx_rate_to_gbp, converted.fxRate) &&
            Number(current.target_margin_bps) === env.GENX_TARGET_MARGIN_BPS &&
            Number(current.credits_per_unit) === credits
          );
          if (unchanged) continue;

          if (current) {
            await client.query(
              'UPDATE genx_price_snapshots SET effective_to=NOW() WHERE id=$1',
              [current.id]
            );
          }

          await client.query(
            `INSERT INTO genx_price_snapshots
               (model_id,operation,billable_unit,source_currency,source_unit_cost,
                fx_rate_to_gbp,wholesale_unit_cost_gbp,target_margin_bps,
                retail_unit_cost_gbp,credits_per_unit,pricing_source,
                agent_tier_applied,raw_metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'genx_api',$11,$12)`,
            [
              model.id,
              component.operation,
              component.billableUnit,
              normalizeCurrency(component.sourceCurrency),
              component.sourceUnitCost,
              converted.fxRate,
              converted.amountGbp,
              env.GENX_TARGET_MARGIN_BPS,
              retailGbp,
              credits,
              component.agentTierApplied,
              JSON.stringify(component.rawMetadata),
            ]
          );
          snapshotsCreated += 1;
        }

        await client.query(
          `UPDATE genx_models SET retail_enabled=TRUE,pricing_status='priced',
             pricing_last_synced_at=NOW(),pricing_error=NULL
           WHERE id=$1`,
          [model.id]
        );
      });
      priced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ model_id: model.id, error: message });
      unpriced += 1;
      await query(
        `UPDATE genx_models SET retail_enabled=FALSE,pricing_status='error',
           pricing_last_synced_at=NOW(),pricing_error=$2
         WHERE id=$1`,
        [model.id, message.slice(0, 2000)]
      );
    }
  }

  return { priced, unpriced, snapshotsCreated, errors };
}

export async function listActivePrices(modelId?: string): Promise<Array<Record<string, unknown>>> {
  const params: unknown[] = [];
  let sql = `SELECT gps.*,gm.name AS model_name,gm.category,
                    gm.retail_enabled,gm.pricing_status
             FROM genx_price_snapshots gps
             JOIN genx_models gm ON gm.id=gps.model_id
             WHERE gps.effective_to IS NULL`;
  if (modelId) {
    params.push(modelId);
    sql += ` AND gps.model_id=$${params.length}`;
  }
  sql += ' ORDER BY gm.category,gm.name,gps.operation';
  return (await query(sql, params)).rows;
}

export async function quoteGeneration(input: {
  modelId: string;
  operation: string;
  quantity: number;
}): Promise<GenXPriceQuote> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new AppError(400, 'Quantity must be positive', 'GENX_QUOTE_QUANTITY_INVALID');
  }

  const result = await query(
    `SELECT gps.*,gm.retail_enabled,gm.pricing_status
     FROM genx_price_snapshots gps
     JOIN genx_models gm ON gm.id=gps.model_id
     WHERE gps.model_id=$1 AND gps.operation=$2 AND gps.effective_to IS NULL
     LIMIT 1`,
    [input.modelId, input.operation]
  );
  if (!result.rows[0]) throw new NotFoundError('Active GenX price');

  const row = result.rows[0];
  if (row.retail_enabled !== true || String(row.pricing_status) !== 'priced') {
    throw new AppError(
      503,
      'This GenX model is not enabled for paid generation',
      'GENX_MODEL_UNPRICED'
    );
  }

  const effectiveFrom = new Date(row.effective_from);
  const maximumAgeMs = env.GENX_PRICE_MAX_AGE_MINUTES * 60_000;
  if (
    !Number.isFinite(effectiveFrom.getTime()) ||
    Date.now() - effectiveFrom.getTime() > maximumAgeMs
  ) {
    throw new AppError(
      503,
      'The GenX price is stale and must be refreshed',
      'GENX_PRICE_STALE'
    );
  }

  const wholesale = Number(row.wholesale_unit_cost_gbp) * input.quantity;
  const retail = Number(row.retail_unit_cost_gbp) * input.quantity;
  const baseCredits = Math.max(
    1,
    Math.ceil(retail * env.GENERATION_CREDITS_PER_GBP)
  );
  const reservationCredits = Math.max(
    baseCredits,
    Math.ceil(baseCredits * (1 + env.GENX_RESERVATION_BUFFER_BPS / 10_000))
  );

  return {
    model_id: input.modelId,
    operation: input.operation,
    billable_unit: String(row.billable_unit),
    quantity: input.quantity,
    currency: 'GBP',
    wholesale_cost_gbp: wholesale,
    retail_charge_gbp: retail,
    base_credits: baseCredits,
    reservation_credits: reservationCredits,
    target_margin_bps: Number(row.target_margin_bps),
    price_snapshot_id: String(row.id),
    price_effective_from: effectiveFrom.toISOString(),
  };
}
