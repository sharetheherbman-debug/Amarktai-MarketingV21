import { query } from '../config/database';
import { logger } from '../utils/logger';
import { openSecrets } from './external-platform.service';
import { fetchExtendedSocialMetrics } from './extended-social-platform.service';
import { safeFetch } from '../utils/safe-fetch';

interface MetricResult {
  metrics: Record<string, number>;
  raw: Record<string, unknown>;
  resolvedExternalId?: string;
  externalUrl?: string;
  pending?: boolean;
}

function asObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try { return JSON.parse(String(value)) as Record<string, any>; }
  catch { return {}; }
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function jsonRequest(url: string, headers: Record<string, string>): Promise<Record<string, any>> {
  const response = await safeFetch(url, { headers, timeoutMs: 30000, maxResponseBytes: 5 * 1024 * 1024 });
  const text = await response.text();
  let data: Record<string, any> = {};
  try { data = text ? JSON.parse(text) as Record<string, any> : {}; }
  catch { data = { text }; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${String(data.error?.message || data.message || data.text || response.status)}`);
  return data;
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function pinterestMetrics(raw: Record<string, any>): Record<string, number> {
  const source = asObject(raw.pin_metrics || raw.metrics || raw.summary_metrics);
  const candidates = asObject(source.lifetime_metrics || source['90d'] || source.summary_metrics || source);
  const mapped: Record<string, number> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
      mapped[key.toLowerCase()] = numberValue(value);
    }
  }
  return mapped;
}

async function fetchNativeMetrics(
  platform: string,
  credentials: Record<string, unknown>,
  config: Record<string, unknown>,
  externalId: string,
  submissionId: string | null
): Promise<MetricResult | null> {
  const extended = await fetchExtendedSocialMetrics(platform, credentials, config, platform === 'tiktok' ? (submissionId || externalId) : externalId);
  if (extended) return extended;

  const token = String(credentials.access_token || '');
  if (!token) return null;

  if (platform === 'x') {
    const raw = await jsonRequest(`https://api.x.com/2/tweets/${encodeURIComponent(externalId)}?tweet.fields=public_metrics`, bearer(token));
    const metrics = asObject(raw.data?.public_metrics);
    return {
      metrics: {
        impressions: numberValue(metrics.impression_count),
        likes: numberValue(metrics.like_count),
        replies: numberValue(metrics.reply_count),
        reposts: numberValue(metrics.retweet_count),
        quotes: numberValue(metrics.quote_count),
        bookmarks: numberValue(metrics.bookmark_count),
      },
      raw,
    };
  }

  if (platform === 'linkedin') {
    const version = String(config.linkedin_version || '202607');
    const raw = await jsonRequest(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(externalId)}`, bearer(token, {
      'LinkedIn-Version': version,
      'X-Restli-Protocol-Version': '2.0.0',
    }));
    return {
      metrics: {
        likes: numberValue(raw.likesSummary?.aggregatedTotalLikes ?? raw.likesSummary?.totalLikes),
        comments: numberValue(raw.commentsSummary?.aggregatedTotalComments ?? raw.commentsSummary?.totalFirstLevelComments),
      },
      raw,
    };
  }

  if (platform === 'facebook') {
    const version = String(config.api_version || 'v25.0');
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(externalId)}?fields=shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)&access_token=${encodeURIComponent(token)}`;
    const raw = await jsonRequest(url, {});
    return {
      metrics: {
        shares: numberValue(raw.shares?.count),
        comments: numberValue(raw.comments?.summary?.total_count),
        reactions: numberValue(raw.reactions?.summary?.total_count),
      },
      raw,
    };
  }

  if (platform === 'instagram') {
    const version = String(config.api_version || 'v25.0');
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(externalId)}?fields=like_count,comments_count,permalink,media_type&access_token=${encodeURIComponent(token)}`;
    const raw = await jsonRequest(url, {});
    return {
      metrics: { likes: numberValue(raw.like_count), comments: numberValue(raw.comments_count) },
      raw,
      externalUrl: raw.permalink ? String(raw.permalink) : undefined,
    };
  }

  if (platform === 'threads') {
    const version = String(config.api_version || 'v1.0');
    const url = `https://graph.threads.net/${version}/${encodeURIComponent(externalId)}/insights?metric=views,likes,replies,reposts,quotes,shares&access_token=${encodeURIComponent(token)}`;
    const raw = await jsonRequest(url, {});
    const metrics: Record<string, number> = {};
    for (const row of Array.isArray(raw.data) ? raw.data as Array<Record<string, any>> : []) {
      const value = Array.isArray(row.values) ? row.values[0]?.value : row.value;
      metrics[String(row.name || '').toLowerCase()] = numberValue(value);
    }
    return { metrics, raw };
  }

  if (platform === 'pinterest') {
    const raw = await jsonRequest(`https://api.pinterest.com/v5/pins/${encodeURIComponent(externalId)}?pin_metrics=true`, bearer(token, { Accept: 'application/json' }));
    return { metrics: pinterestMetrics(raw), raw };
  }

  if (platform === 'reddit') {
    const fullname = externalId.startsWith('t3_') ? externalId : `t3_${externalId}`;
    const raw = await jsonRequest(`https://oauth.reddit.com/api/info?id=${encodeURIComponent(fullname)}&raw_json=1`, bearer(token, {
      'User-Agent': String(config.user_agent || 'AmarktAIMarketing/1.0'),
    }));
    const post = raw.data?.children?.[0]?.data || {};
    return {
      metrics: {
        score: numberValue(post.score), comments: numberValue(post.num_comments),
        upvote_ratio: numberValue(post.upvote_ratio),
      },
      raw,
      externalUrl: post.permalink ? `https://www.reddit.com${String(post.permalink)}` : undefined,
    };
  }

  if (platform === 'youtube') {
    const raw = await jsonRequest(`https://www.googleapis.com/youtube/v3/videos?part=statistics,status&id=${encodeURIComponent(externalId)}`, bearer(token));
    const video = Array.isArray(raw.items) ? raw.items[0] : undefined;
    if (!video) return null;
    const stats = asObject(video.statistics);
    return {
      metrics: {
        views: numberValue(stats.viewCount), likes: numberValue(stats.likeCount), comments: numberValue(stats.commentCount),
      },
      raw,
      externalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(externalId)}`,
    };
  }

  return null;
}

async function recordSyncEvent(
  row: Record<string, any>,
  status: 'synced' | 'unsupported' | 'pending' | 'failed',
  metrics: Record<string, number>,
  detail: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO social_performance_sync_events
       (organization_id,social_post_id,platform,external_id,metrics,status,detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.organization_id, row.id, row.platform, row.external_id || null, JSON.stringify(metrics), status, JSON.stringify(detail)]
  );
}

async function persistPerformance(row: Record<string, any>, result: MetricResult): Promise<void> {
  const resolvedExternalId = result.resolvedExternalId || String(row.external_id || '');
  const externalUrl = result.externalUrl || row.external_url || null;
  await query(
    `UPDATE social_posts SET
       engagement=$1,
       external_id=CASE WHEN $2<>'' THEN $2 ELSE external_id END,
       external_url=COALESCE($3,external_url),
       provider_submission_id=COALESCE(provider_submission_id,$4),
       last_metrics_sync_at=NOW(),metrics_sync_error=NULL,updated_at=NOW()
     WHERE id=$5 AND organization_id=$6`,
    [
      JSON.stringify(result.metrics), resolvedExternalId, externalUrl,
      row.platform === 'tiktok' ? String(row.provider_submission_id || row.external_id || '') : null,
      row.id, row.organization_id,
    ]
  );

  const eventId = `social-metrics:${row.id}:${new Date().toISOString().slice(0, 10)}`;
  await query(
    `INSERT INTO marketing_performance_events
       (organization_id,event_id,event_type,occurred_at,campaign_id,content_id,platform,source,medium,metrics)
     VALUES ($1,$2,'social_performance_snapshot',NOW(),$3,$4,$5,$5,'organic_social',$6)
     ON CONFLICT (organization_id,event_id) DO UPDATE SET
       occurred_at=EXCLUDED.occurred_at,metrics=EXCLUDED.metrics,platform=EXCLUDED.platform,
       source=EXCLUDED.source,medium=EXCLUDED.medium`,
    [row.organization_id, eventId, row.campaign_id || null, row.content_id || null, row.platform, JSON.stringify(result.metrics)]
  );
  await recordSyncEvent(row, result.pending ? 'pending' : 'synced', result.metrics, result.raw);
}

export async function syncPublishedSocialPerformance(limit = 50): Promise<{ attempted: number; synced: number; unsupported: number; pending: number; failed: number }> {
  const result = await query(
    `SELECT post.*,connection.config AS connection_config
     FROM social_posts post
     JOIN social_connections connection
       ON connection.id=post.connection_id AND connection.organization_id=post.organization_id
     WHERE post.status='published' AND post.external_id IS NOT NULL
       AND connection.status='active'
       AND (post.last_metrics_sync_at IS NULL OR post.last_metrics_sync_at<NOW()-INTERVAL '30 minutes')
     ORDER BY post.last_metrics_sync_at NULLS FIRST,post.published_at DESC NULLS LAST
     LIMIT $1`,
    [Math.max(1, Math.min(limit, 200))]
  );

  const summary = { attempted: result.rows.length, synced: 0, unsupported: 0, pending: 0, failed: 0 };
  for (const row of result.rows as Array<Record<string, any>>) {
    try {
      const config = asObject(row.connection_config);
      const credentials = openSecrets(config.credentials);
      const { credentials: _credentials, ...publicConfig } = config;
      const metrics = await fetchNativeMetrics(
        String(row.platform), credentials, publicConfig,
        String(row.external_id), row.provider_submission_id ? String(row.provider_submission_id) : null
      );
      if (!metrics) {
        await query(
          `UPDATE social_posts SET last_metrics_sync_at=NOW(),metrics_sync_error=NULL,updated_at=NOW()
           WHERE id=$1 AND organization_id=$2`, [row.id, row.organization_id]
        );
        await recordSyncEvent(row, 'unsupported', {}, { reason: 'Provider does not expose reliable post-level metrics through the configured API permission set.' });
        summary.unsupported++;
        continue;
      }
      await persistPerformance(row, metrics);
      if (metrics.pending) summary.pending++;
      else summary.synced++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query(
        `UPDATE social_posts SET last_metrics_sync_at=NOW(),metrics_sync_error=$1,updated_at=NOW()
         WHERE id=$2 AND organization_id=$3`, [message.slice(0, 2000), row.id, row.organization_id]
      );
      await recordSyncEvent(row, 'failed', {}, { error: message.slice(0, 500) });
      summary.failed++;
      logger.warn(`Social metrics sync failed for ${row.platform} post ${row.id}: ${message}`);
    }
  }
  return summary;
}
