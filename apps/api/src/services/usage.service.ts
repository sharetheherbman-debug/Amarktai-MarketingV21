import { query } from '../config/database';
import { logger } from '../utils/logger';

interface TrackUsageData {
  organizationId: string;
  userId?: string;
  providerId: string;
  model: string;
  action: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  metadata?: Record<string, unknown>;
}

interface UsageSummary {
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostCents: number;
  byProvider: Record<string, { tokensIn: number; tokensOut: number; costCents: number }>;
  byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }>;
}

const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'gpt-4o': { inputPer1k: 2.5, outputPer1k: 10 },
  'gpt-4o-mini': { inputPer1k: 0.15, outputPer1k: 0.6 },
  'gpt-4-turbo': { inputPer1k: 10, outputPer1k: 30 },
  'gpt-3.5-turbo': { inputPer1k: 0.5, outputPer1k: 1.5 },
  'claude-3-opus': { inputPer1k: 15, outputPer1k: 75 },
  'claude-3-sonnet': { inputPer1k: 3, outputPer1k: 15 },
  'claude-3-haiku': { inputPer1k: 0.25, outputPer1k: 1.25 },
  'gemini-pro': { inputPer1k: 0.5, outputPer1k: 1.5 },
  'llama-3.1-70b': { inputPer1k: 0.9, outputPer1k: 0.9 },
  'mixtral-8x7b': { inputPer1k: 0.6, outputPer1k: 0.6 },
};

export async function track(data: TrackUsageData): Promise<void> {
  try {
    await query(
      `INSERT INTO usage_tracking (organization_id, user_id, provider_id, model, action, tokens_in, tokens_out, cost_cents, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        data.organizationId,
        data.userId || null,
        data.providerId,
        data.model,
        data.action,
        data.tokensIn,
        data.tokensOut,
        data.costCents,
        JSON.stringify(data.metadata || {}),
      ]
    );
  } catch (error) {
    logger.error(`Failed to track usage: ${error}`);
    throw error;
  }
}

export async function getUsageByOrg(orgId: string, startDate: Date, endDate: Date): Promise<UsageSummary> {
  const result = await query(
    `SELECT
       COALESCE(SUM(tokens_in), 0) as total_tokens_in,
       COALESCE(SUM(tokens_out), 0) as total_tokens_out,
       COALESCE(SUM(cost_cents), 0) as total_cost_cents
     FROM usage_tracking
     WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [orgId, startDate, endDate]
  );

  const byProviderResult = await query(
    `SELECT provider_id,
       COALESCE(SUM(tokens_in), 0) as tokens_in,
       COALESCE(SUM(tokens_out), 0) as tokens_out,
       COALESCE(SUM(cost_cents), 0) as cost_cents
     FROM usage_tracking
     WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY provider_id`,
    [orgId, startDate, endDate]
  );

  const byModelResult = await query(
    `SELECT model,
       COALESCE(SUM(tokens_in), 0) as tokens_in,
       COALESCE(SUM(tokens_out), 0) as tokens_out,
       COALESCE(SUM(cost_cents), 0) as cost_cents
     FROM usage_tracking
     WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY model`,
    [orgId, startDate, endDate]
  );

  const row = result.rows[0];
  const byProvider: Record<string, { tokensIn: number; tokensOut: number; costCents: number }> = {};
  for (const r of byProviderResult.rows) {
    byProvider[r.provider_id] = {
      tokensIn: parseInt(r.tokens_in),
      tokensOut: parseInt(r.tokens_out),
      costCents: parseInt(r.cost_cents),
    };
  }

  const byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }> = {};
  for (const r of byModelResult.rows) {
    byModel[r.model] = {
      tokensIn: parseInt(r.tokens_in),
      tokensOut: parseInt(r.tokens_out),
      costCents: parseInt(r.cost_cents),
    };
  }

  return {
    totalTokensIn: parseInt(row.total_tokens_in),
    totalTokensOut: parseInt(row.total_tokens_out),
    totalCostCents: parseInt(row.total_cost_cents),
    byProvider,
    byModel,
  };
}

export async function getUsageByProvider(providerId: string, startDate: Date, endDate: Date): Promise<UsageSummary> {
  const result = await query(
    `SELECT
       COALESCE(SUM(tokens_in), 0) as total_tokens_in,
       COALESCE(SUM(tokens_out), 0) as total_tokens_out,
       COALESCE(SUM(cost_cents), 0) as total_cost_cents
     FROM usage_tracking
     WHERE provider_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [providerId, startDate, endDate]
  );

  const byModelResult = await query(
    `SELECT model,
       COALESCE(SUM(tokens_in), 0) as tokens_in,
       COALESCE(SUM(tokens_out), 0) as tokens_out,
       COALESCE(SUM(cost_cents), 0) as cost_cents
     FROM usage_tracking
     WHERE provider_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY model`,
    [providerId, startDate, endDate]
  );

  const row = result.rows[0];
  const byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }> = {};
  for (const r of byModelResult.rows) {
    byModel[r.model] = {
      tokensIn: parseInt(r.tokens_in),
      tokensOut: parseInt(r.tokens_out),
      costCents: parseInt(r.cost_cents),
    };
  }

  return {
    totalTokensIn: parseInt(row.total_tokens_in),
    totalTokensOut: parseInt(row.total_tokens_out),
    totalCostCents: parseInt(row.total_cost_cents),
    byProvider: {},
    byModel,
  };
}

export async function getUsageByUser(userId: string, startDate: Date, endDate: Date): Promise<UsageSummary> {
  const result = await query(
    `SELECT
       COALESCE(SUM(tokens_in), 0) as total_tokens_in,
       COALESCE(SUM(tokens_out), 0) as total_tokens_out,
       COALESCE(SUM(cost_cents), 0) as total_cost_cents
     FROM usage_tracking
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [userId, startDate, endDate]
  );

  const byProviderResult = await query(
    `SELECT provider_id,
       COALESCE(SUM(tokens_in), 0) as tokens_in,
       COALESCE(SUM(tokens_out), 0) as tokens_out,
       COALESCE(SUM(cost_cents), 0) as cost_cents
     FROM usage_tracking
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY provider_id`,
    [userId, startDate, endDate]
  );

  const byModelResult = await query(
    `SELECT model,
       COALESCE(SUM(tokens_in), 0) as tokens_in,
       COALESCE(SUM(tokens_out), 0) as tokens_out,
       COALESCE(SUM(cost_cents), 0) as cost_cents
     FROM usage_tracking
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY model`,
    [userId, startDate, endDate]
  );

  const row = result.rows[0];
  const byProvider: Record<string, { tokensIn: number; tokensOut: number; costCents: number }> = {};
  for (const r of byProviderResult.rows) {
    byProvider[r.provider_id] = {
      tokensIn: parseInt(r.tokens_in),
      tokensOut: parseInt(r.tokens_out),
      costCents: parseInt(r.cost_cents),
    };
  }

  const byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }> = {};
  for (const r of byModelResult.rows) {
    byModel[r.model] = {
      tokensIn: parseInt(r.tokens_in),
      tokensOut: parseInt(r.tokens_out),
      costCents: parseInt(r.cost_cents),
    };
  }

  return {
    totalTokensIn: parseInt(row.total_tokens_in),
    totalTokensOut: parseInt(row.total_tokens_out),
    totalCostCents: parseInt(row.total_cost_cents),
    byProvider,
    byModel,
  };
}

export async function getCurrentMonthUsage(orgId: string): Promise<UsageSummary> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  return getUsageByOrg(orgId, startOfMonth, endOfMonth);
}

export function estimateCost(provider: string, model: string, tokensIn: number, tokensOut: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0;
  }

  const inputCost = (tokensIn / 1000) * pricing.inputPer1k;
  const outputCost = (tokensOut / 1000) * pricing.outputPer1k;

  return Math.ceil((inputCost + outputCost) * 100);
}
