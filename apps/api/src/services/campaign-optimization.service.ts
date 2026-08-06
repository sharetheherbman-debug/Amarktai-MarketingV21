import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import { contextEngine } from './context-engine.service';
import { env } from '../config/env';

export interface CampaignOptimization {
  id: string;
  organization_id: string;
  campaign_id: string;
  type: string;
  recommendation: string;
  data: Record<string, unknown>;
  status: string;
  impact_score: number;
  applied_at: string | null;
  created_at: string;
}

function parseRecommendations(content: string): Array<Record<string, unknown>> {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start < 0 || end <= start) throw new AppError(502, 'AI provider returned invalid optimization JSON', 'AI_RESPONSE_INVALID');
    try { parsed = JSON.parse(cleaned.slice(start, end + 1)); }
    catch { throw new AppError(502, 'AI provider returned invalid optimization JSON', 'AI_RESPONSE_INVALID'); }
  }
  if (!Array.isArray(parsed)) throw new AppError(502, 'AI optimization response must be an array', 'AI_RESPONSE_INVALID');
  const recommendations = parsed.slice(0, 10).flatMap((value): Array<Record<string, unknown>> => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const recommendation = String(row.recommendation || '').trim();
    if (!recommendation) return [];
    return [{
      type: String(row.type || 'general').slice(0, 80),
      recommendation,
      impact_score: Math.max(0, Math.min(Number(row.impact_score || 50), 100)),
      data: row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {},
    }];
  });
  if (recommendations.length === 0) throw new AppError(502, 'AI provider returned no usable optimization recommendations', 'AI_RESPONSE_INVALID');
  return recommendations;
}

export async function analyzeCampaign(orgId: string, campaignId: string): Promise<CampaignOptimization[]> {
  const campaignResult = await query('SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2', [campaignId, orgId]);
  if (campaignResult.rows.length === 0) throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  const campaign = campaignResult.rows[0];
  const metrics = typeof campaign.metrics === 'string' ? JSON.parse(campaign.metrics) : campaign.metrics || {};
  const contentResult = await query(
    'SELECT type, status, quality_score, word_count FROM content_items WHERE campaign_id = $1 AND organization_id = $2',
    [campaignId, orgId]
  );
  const context = await contextEngine.assemble({ orgId, includeBrandDna: true, includeKnowledge: true, knowledgeQuery: String(campaign.name || '') });
  const prompt = `Analyze this marketing campaign and return 3-5 specific optimization recommendations as strict JSON.\n\nCampaign: ${campaign.name}\nType: ${campaign.type}\nStatus: ${campaign.status}\nMetrics: ${JSON.stringify(metrics)}\nContent: ${JSON.stringify(contentResult.rows)}\n${context.fullContext}\n\nSchema: [{"type":"content_rewrite|timing|keyword|audience|budget","recommendation":"specific action","impact_score":0,"data":{"steps":["..."]}}]`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'system', content: 'Return only valid JSON. Do not invent performance data that is not provided.' }, { role: 'user', content: prompt }],
      env.DEFAULT_TEXT_MODEL,
      { max_tokens: 3000, temperature: 0.3 },
      { organizationId: orgId }
    );
    const recommendations = parseRecommendations(result.content);
    const optimizations: CampaignOptimization[] = [];
    for (const recommendation of recommendations) {
      const dbResult = await query(
        `INSERT INTO campaign_optimizations (organization_id, campaign_id, type, recommendation, data, impact_score)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [orgId, campaignId, recommendation.type, recommendation.recommendation, JSON.stringify(recommendation.data || {}), recommendation.impact_score]
      );
      optimizations.push(mapRow(dbResult.rows[0]));
    }
    logger.info(`Campaign ${campaignId} analyzed: ${optimizations.length} recommendations`);
    return optimizations;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Campaign analysis failed: ${message}`);
    throw new AppError(502, `Campaign analysis failed: ${message}`, 'CAMPAIGN_ANALYSIS_FAILED');
  }
}

export async function listOptimizations(orgId: string, campaignId?: string): Promise<CampaignOptimization[]> {
  let sql = 'SELECT * FROM campaign_optimizations WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (campaignId) { sql += ' AND campaign_id = $2'; params.push(campaignId); }
  sql += ' ORDER BY impact_score DESC, created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function applyOptimization(id: string, orgId: string): Promise<void> {
  const result = await query(
    "UPDATE campaign_optimizations SET status = 'applied', applied_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id",
    [id, orgId]
  );
  if (result.rows.length === 0) throw new AppError(404, 'Campaign optimization not found', 'NOT_FOUND');
  logger.info(`Optimization ${id} applied`);
}

function mapRow(row: Record<string, unknown>): CampaignOptimization {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    campaign_id: String(row.campaign_id),
    type: String(row.type),
    recommendation: String(row.recommendation),
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    status: String(row.status),
    impact_score: Number(row.impact_score || 0),
    applied_at: row.applied_at ? String(row.applied_at) : null,
    created_at: String(row.created_at),
  };
}
