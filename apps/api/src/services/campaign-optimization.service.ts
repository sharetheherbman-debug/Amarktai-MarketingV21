import { query } from '../config/database';
import { logger } from '../utils/logger';
import { providerRouter } from '../providers/provider-router';
import { contextEngine } from './context-engine.service';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Optimization Analysis ───────────────────────────────────────────────────

export async function analyzeCampaign(orgId: string, campaignId: string): Promise<CampaignOptimization[]> {
  // Get campaign data
  const campaignResult = await query(
    'SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2',
    [campaignId, orgId]
  );
  if (campaignResult.rows.length === 0) return [];

  const campaign = campaignResult.rows[0];
  const metrics = typeof campaign.metrics === 'string' ? JSON.parse(campaign.metrics) : campaign.metrics || {};

  // Get related content performance
  const contentResult = await query(
    'SELECT type, status, quality_score, word_count FROM content_items WHERE campaign_id = $1 AND organization_id = $2',
    [campaignId, orgId]
  );

  const context = await contextEngine.assemble({ orgId, agentId: '', includeBrandDna: true });

  const prompt = `Analyze this marketing campaign and provide optimization recommendations.

Campaign: ${campaign.name}
Type: ${campaign.type}
Status: ${campaign.status}
Metrics: ${JSON.stringify(metrics)}
Content pieces: ${contentResult.rows.length}
${context.brandDna ? `Brand: ${context.brandDna.substring(0, 500)}` : ''}

Provide 3-5 specific optimization recommendations with:
- Type (content_rewrite, timing, keyword, audience, budget)
- Specific recommendation
- Estimated impact (0-100)
- Implementation steps

Return as JSON: [{"type":"...","recommendation":"...","impact_score":0,"data":{"steps":["..."]}}]`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 3000, temperature: 0.7 },
      { organizationId: orgId }
    );

    const recommendations = JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
    const optimizations: CampaignOptimization[] = [];

    for (const rec of recommendations) {
      const dbResult = await query(
        `INSERT INTO campaign_optimizations (organization_id, campaign_id, type, recommendation, data, impact_score)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [orgId, campaignId, rec.type, rec.recommendation, JSON.stringify(rec.data || {}), rec.impact_score || 50]
      );
      optimizations.push(mapRow(dbResult.rows[0]));
    }

    logger.info(`Campaign ${campaignId} analyzed: ${optimizations.length} recommendations`);
    return optimizations;
  } catch (error) {
    logger.error(`Campaign analysis failed: ${error}`);
    return [];
  }
}

export async function listOptimizations(orgId: string, campaignId?: string): Promise<CampaignOptimization[]> {
  let sql = 'SELECT * FROM campaign_optimizations WHERE organization_id = $1';
  const params: unknown[] = [orgId];

  if (campaignId) {
    sql += ' AND campaign_id = $2';
    params.push(campaignId);
  }

  sql += ' ORDER BY impact_score DESC, created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function applyOptimization(id: string, orgId: string): Promise<void> {
  await query(
    "UPDATE campaign_optimizations SET status = 'applied', applied_at = NOW() WHERE id = $1 AND organization_id = $2",
    [id, orgId]
  );
  logger.info(`Optimization ${id} applied`);
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): CampaignOptimization {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    campaign_id: row.campaign_id as string,
    type: row.type as string,
    recommendation: row.recommendation as string,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    status: row.status as string,
    impact_score: parseFloat(row.impact_score as string) || 0,
    applied_at: row.applied_at as string | null,
    created_at: row.created_at as string,
  };
}
