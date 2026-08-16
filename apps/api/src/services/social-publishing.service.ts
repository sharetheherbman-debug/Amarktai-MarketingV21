import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { openSecrets, sealSecrets } from './external-platform.service';
import { deliverSocialPost } from './strict-social-delivery.service';
import {
  connectionCredentialSatisfied,
  isExtendedSocialPlatform,
  testExtendedSocialConnection,
} from './extended-social-platform.service';
import { assertApprovedContentVersion } from './approved-content.service';
import { validatePublicHttpUrl } from '../utils/safe-fetch';

export interface SocialConnection {
  id: string;
  organization_id: string;
  platform: string;
  account_name: string | null;
  account_id: string | null;
  status: string;
  config: Record<string, unknown>;
  last_sync_at: string | null;
  created_at: string;
}

export interface SocialPost {
  id: string;
  organization_id: string;
  connection_id: string | null;
  content_id: string | null;
  campaign_id: string | null;
  platform: string;
  body: string | null;
  media_urls: string[];
  hashtags: string[];
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  external_id: string | null;
  external_url: string | null;
  engagement: Record<string, unknown>;
  provider_response: Record<string, unknown>;
  error: string | null;
  created_at: string;
}

export const SOCIAL_PLATFORM_CAPABILITIES = {
  x: { enabled: true, formats: ['text'], notes: 'Text posts are production-enabled.' },
  linkedin: { enabled: true, formats: ['text','single_image','multi_image','single_video'], notes: 'Organic Posts API with image, multi-image and bounded video upload support.' },
  facebook: { enabled: true, formats: ['text','link'], notes: 'Page feed text and link posts.' },
  instagram: { enabled: true, formats: ['single_image'], notes: 'Instagram Business single-image publishing.' },
  threads: { enabled: true, formats: ['text'], notes: 'Text posts.' },
  pinterest: { enabled: true, formats: ['single_image'], notes: 'One approved image URL to a configured board.' },
  reddit: { enabled: true, formats: ['text','link'], notes: 'Self or link post to a configured subreddit.' },
  youtube: { enabled: true, formats: ['single_video'], notes: 'One bounded video upload; privacy defaults to private unless configured.' },
  tiktok: { enabled: true, formats: ['single_video','photo_carousel'], notes: 'Direct Post code-ready. Public visibility remains provider-gated by TikTok app audit, video.publish authorization and creator consent.' },
  bluesky: { enabled: true, formats: ['text','single_image','multi_image'], notes: 'AT Protocol posts with up to four approved images.' },
  mastodon: { enabled: true, formats: ['text','single_image','multi_image','single_video'], notes: 'Instance-scoped statuses with up to four approved media attachments.' },
  telegram: { enabled: true, formats: ['text','single_image','multi_image','single_video','media_group'], notes: 'Bot API channel publishing with up to ten approved media items.' },
} as const;

function assertSupportedSocialPayload(platform: string, mediaUrls: string[]): void {
  const capability = SOCIAL_PLATFORM_CAPABILITIES[platform as keyof typeof SOCIAL_PLATFORM_CAPABILITIES];
  if (!capability?.enabled) throw new AppError(400, `${platform} publishing is disabled for this release`, 'UNSUPPORTED_SOCIAL_PLATFORM');
  if (['x','threads'].includes(platform) && mediaUrls.length > 0) {
    throw new AppError(400, `${platform} media publishing is not enabled; use an approved text-only asset`, 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  if (['instagram','pinterest','youtube'].includes(platform) && mediaUrls.length !== 1) {
    throw new AppError(400, `${platform} requires exactly one approved media URL`, 'SOCIAL_MEDIA_REQUIRED');
  }
  if (['facebook','reddit'].includes(platform) && mediaUrls.length > 1) {
    throw new AppError(400, `${platform} supports at most one approved link in this release`, 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  if (platform === 'linkedin' && mediaUrls.length > 20) {
    throw new AppError(400, 'LinkedIn supports at most 20 approved images, or one approved video', 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  if (platform === 'tiktok' && (mediaUrls.length < 1 || mediaUrls.length > 35)) {
    throw new AppError(400, 'TikTok Direct Post requires 1-35 approved media URLs', 'SOCIAL_MEDIA_REQUIRED');
  }
  if (platform === 'bluesky' && mediaUrls.length > 4) {
    throw new AppError(400, 'Bluesky supports at most four approved images', 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  if (platform === 'mastodon' && mediaUrls.length > 4) {
    throw new AppError(400, 'Mastodon supports at most four approved media attachments', 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  if (platform === 'telegram' && mediaUrls.length > 10) {
    throw new AppError(400, 'Telegram media groups support at most ten approved media items', 'SOCIAL_FORMAT_UNSUPPORTED');
  }
}

function publicConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { credentials: _credentials, ...visible } = config;
  return visible;
}

function configFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return typeof row.config === 'string'
    ? JSON.parse(row.config)
    : (row.config as Record<string, unknown>) || {};
}

export async function listConnections(orgId: string): Promise<SocialConnection[]> {
  const result = await query(
    'SELECT * FROM social_connections WHERE organization_id = $1 ORDER BY platform ASC',
    [orgId]
  );
  return result.rows.map(mapConnectionRow);
}

export async function addConnection(
  orgId: string,
  platform: string,
  accountName: string,
  config: Record<string, unknown> = {},
  credentials: Record<string, unknown> = {}
): Promise<SocialConnection> {
  const capability = SOCIAL_PLATFORM_CAPABILITIES[platform as keyof typeof SOCIAL_PLATFORM_CAPABILITIES];
  if (!capability?.enabled) throw new AppError(400, `${platform} is disabled or deferred for this release`, 'UNSUPPORTED_SOCIAL_PLATFORM');
  if (!connectionCredentialSatisfied(platform, credentials)) {
    throw new AppError(400, `Required ${platform} credentials are missing`, 'SOCIAL_CREDENTIALS_REQUIRED');
  }

  const storedConfig = {
    ...config,
    credentials: sealSecrets(credentials),
  };

  const result = await query(
    `INSERT INTO social_connections (organization_id, platform, account_name, account_id, config, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
    [orgId, platform, accountName, config.account_id || config.page_id || config.user_id || config.did || config.chat_id || null, JSON.stringify(storedConfig)]
  );
  logger.info(`Social connection added: ${platform} (${accountName}) for org: ${orgId}`);
  return mapConnectionRow(result.rows[0]);
}

export async function updateConnection(
  id: string,
  orgId: string,
  data: { account_name?: string; config?: Record<string, unknown>; credentials?: Record<string, unknown>; status?: string }
): Promise<SocialConnection> {
  const existingResult = await query(
    'SELECT * FROM social_connections WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (existingResult.rows.length === 0) throw new NotFoundError('Social connection');

  const existingConfig = configFromRow(existingResult.rows[0]);
  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    ...(data.config || {}),
  };
  if (data.credentials && Object.keys(data.credentials).length > 0) {
    nextConfig.credentials = sealSecrets(data.credentials);
  }

  const result = await query(
    `UPDATE social_connections
     SET account_name = COALESCE($1, account_name),
         account_id = COALESCE($2, account_id),
         config = $3,
         status = COALESCE($4, status),
         updated_at = NOW()
     WHERE id = $5 AND organization_id = $6
     RETURNING *`,
    [
      data.account_name || null,
      data.config?.account_id || data.config?.page_id || data.config?.user_id || data.config?.did || data.config?.chat_id || null,
      JSON.stringify(nextConfig),
      data.status || null,
      id,
      orgId,
    ]
  );
  return mapConnectionRow(result.rows[0]);
}

export async function removeConnection(id: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM social_connections WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Social connection');
}

export async function testConnection(id: string, orgId: string): Promise<{ healthy: boolean; account?: Record<string, unknown> }> {
  const result = await query(
    'SELECT * FROM social_connections WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Social connection');

  const row = result.rows[0] as Record<string, unknown>;
  const platform = String(row.platform);
  const config = configFromRow(row);
  const credentials = openSecrets(config.credentials);
  if (!connectionCredentialSatisfied(platform, credentials)) {
    throw new AppError(400, 'Connection has no valid provider credential', 'SOCIAL_CREDENTIALS_REQUIRED');
  }

  let account: Record<string, unknown>;
  try {
    if (isExtendedSocialPlatform(platform)) {
      account = await testExtendedSocialConnection(platform, credentials, config);
    } else {
      const token = String(credentials.access_token || '');
      const headers = { Authorization: `Bearer ${token}` };
      let url: string;
      switch (platform) {
        case 'x': url = 'https://api.x.com/2/users/me'; break;
        case 'facebook':
        case 'instagram': url = `https://graph.facebook.com/${String(config.api_version || 'v25.0')}/me?fields=id,name&access_token=${encodeURIComponent(token)}`; break;
        case 'threads': url = `https://graph.threads.net/${String(config.api_version || 'v1.0')}/me?fields=id,username&access_token=${encodeURIComponent(token)}`; break;
        case 'pinterest': url = 'https://api.pinterest.com/v5/user_account'; break;
        case 'reddit': url = 'https://oauth.reddit.com/api/v1/me'; break;
        case 'youtube': url = 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true'; break;
        default: throw new AppError(400, `Unsupported social platform: ${platform}`, 'UNSUPPORTED_SOCIAL_PLATFORM');
      }
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      try { account = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { account = { text }; }
      if (!response.ok) throw new AppError(response.status, `Social connection test failed: ${text || response.statusText}`, 'SOCIAL_CONNECTION_FAILED');
    }
  } catch (error) {
    await query("UPDATE social_connections SET status = 'error', updated_at = NOW() WHERE id = $1 AND organization_id = $2", [id, orgId]);
    throw error;
  }

  await query("UPDATE social_connections SET status = 'active', last_sync_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2", [id, orgId]);
  return { healthy: true, account };
}

export async function schedulePost(
  orgId: string,
  connectionId: string,
  body: string,
  options?: { content_id?: string; campaign_id?: string; media_urls?: string[]; hashtags?: string[]; scheduled_at?: string; approved_content_version?: number; approved_content_hash?: string }
): Promise<SocialPost> {
  const connection = await query(
    'SELECT * FROM social_connections WHERE id = $1 AND organization_id = $2 AND status = $3',
    [connectionId, orgId, 'active']
  );
  if (connection.rows.length === 0) throw new AppError(400, 'An active organization-owned social connection is required', 'SOCIAL_CONNECTION_INVALID');

  const binding = await assertApprovedContentVersion({
    organizationId: orgId,
    contentId: String(options?.content_id || ''),
    channel: 'social',
    platform: String(connection.rows[0].platform),
    body,
    mediaUrls: options?.media_urls,
    hashtags: options?.hashtags,
  });
  assertSupportedSocialPayload(String(connection.rows[0].platform), options?.media_urls || []);
  if ((options?.approved_content_version && options.approved_content_version !== binding.version)
    || (options?.approved_content_hash && options.approved_content_hash !== binding.hash)) {
    throw new AppError(409, 'Approved social content binding changed before persistence', 'CONTENT_APPROVAL_STALE');
  }

  const result = await query(
    `INSERT INTO social_posts (organization_id, connection_id, content_id, campaign_id, platform, body, media_urls, hashtags, status, scheduled_at,approved_content_version,approved_content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12) RETURNING *`,
    [
      orgId,
      connectionId,
      options?.content_id || null,
      options?.campaign_id || null,
      connection.rows[0].platform,
      body,
      JSON.stringify(options?.media_urls || []),
      JSON.stringify(options?.hashtags || []),
      options?.scheduled_at ? 'scheduled' : 'draft',
      options?.scheduled_at || null,
      binding.version,
      binding.hash,
    ]
  );
  logger.info(`Social post created for connection ${connectionId}`);
  return mapPostRow(result.rows[0]);
}

export async function publishPost(postId: string, orgId: string): Promise<SocialPost> {
  const postResult = await query(
    `SELECT sp.*, sc.config AS connection_config, sc.status AS connection_status
     FROM social_posts sp
     JOIN social_connections sc ON sc.id = sp.connection_id
     WHERE sp.id = $1 AND sp.organization_id = $2 AND sc.organization_id = $2`,
    [postId, orgId]
  );
  if (postResult.rows.length === 0) throw new NotFoundError('Social post');

  const row = postResult.rows[0] as Record<string, unknown>;
  if (row.connection_status !== 'active') throw new AppError(400, 'Social connection is not active', 'SOCIAL_CONNECTION_INACTIVE');
  if (row.status === 'published') return mapPostRow(row);

  const mediaUrls = typeof row.media_urls === 'string' ? JSON.parse(row.media_urls) : (row.media_urls as string[]) || [];
  const hashtags = typeof row.hashtags === 'string' ? JSON.parse(row.hashtags) : (row.hashtags as string[]) || [];
  const binding = await assertApprovedContentVersion({
    organizationId: orgId,
    contentId: String(row.content_id || ''),
    channel: 'social',
    platform: String(row.platform),
    body: String(row.body || ''),
    mediaUrls,
    hashtags,
  });
  assertSupportedSocialPayload(String(row.platform), mediaUrls);
  if (Number(row.approved_content_version || 0) !== binding.version
    || String(row.approved_content_hash || '') !== binding.hash) {
    throw new AppError(409, 'The post approval binding is stale', 'CONTENT_APPROVAL_STALE');
  }
  for (const mediaUrl of mediaUrls) await validatePublicHttpUrl(String(mediaUrl));

  await query("UPDATE social_posts SET status = 'publishing', error = NULL WHERE id = $1", [postId]);

  try {
    const connectionConfig = typeof row.connection_config === 'string'
      ? JSON.parse(row.connection_config)
      : (row.connection_config as Record<string, unknown>) || {};
    const credentials = openSecrets(connectionConfig.credentials);
    const { credentials: _credentials, ...platformConfig } = connectionConfig;
    const result = await deliverSocialPost(String(row.platform), credentials, platformConfig, {
      body: String(row.body || ''),
      mediaUrls,
      hashtags,
    });

    const updated = await query(
      `UPDATE social_posts
       SET status = 'published', published_at = NOW(), external_id = $1, external_url = $2,
           provider_response = $3, error = NULL, updated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING *`,
      [result.externalId, result.externalUrl || null, JSON.stringify(result.raw), postId, orgId]
    );
    await query('UPDATE social_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1', [row.connection_id]);
    logger.info(`Social post ${postId} published to ${row.platform} as ${result.externalId}`);
    return mapPostRow(updated.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown social publishing error';
    await query(
      "UPDATE social_posts SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3",
      [message, postId, orgId]
    );
    throw error;
  }
}

export async function publishDuePosts(limit = 20): Promise<number> {
  const claimed = await query(
    `WITH due AS (
       SELECT id FROM social_posts
       WHERE status = 'scheduled' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE social_posts sp
     SET status = 'publishing', updated_at = NOW()
     FROM due
     WHERE sp.id = due.id
     RETURNING sp.id, sp.organization_id`,
    [limit]
  );

  let published = 0;
  for (const row of claimed.rows) {
    try {
      await publishPost(String(row.id), String(row.organization_id));
      published++;
    } catch (error) {
      logger.error(`Scheduled social post ${row.id} failed`, error);
    }
  }
  return published;
}

export async function listPosts(orgId: string, filters?: { platform?: string; status?: string }): Promise<SocialPost[]> {
  let sql = 'SELECT * FROM social_posts WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  let idx = 2;
  if (filters?.platform) { sql += ` AND platform = $${idx++}`; params.push(filters.platform); }
  if (filters?.status) { sql += ` AND status = $${idx++}`; params.push(filters.status); }
  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapPostRow);
}

export async function getUpcomingPosts(orgId: string, days = 7): Promise<SocialPost[]> {
  const result = await query(
    `SELECT * FROM social_posts WHERE organization_id = $1 AND status = 'scheduled'
     AND scheduled_at <= CURRENT_DATE + ($2 || ' days')::interval
     ORDER BY scheduled_at ASC`,
    [orgId, days]
  );
  return result.rows.map(mapPostRow);
}

export function formatForPlatform(platform: string, body: string, maxLength?: number): string {
  const limits: Record<string, number> = {
    x: 280, threads: 500, facebook: 63206, instagram: 2200, linkedin: 3000,
    pinterest: 500, reddit: 40000, youtube: 5000, tiktok: 2200,
    bluesky: 300, mastodon: 500, telegram: 4096,
  };
  const limit = maxLength || limits[platform] || 2000;
  if (body.length <= limit) return body;
  return `${body.substring(0, limit - 3)}...`;
}

export function getHashtagsForPlatform(_platform: string, topic: string): string[] {
  const base = topic.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return [`#${base}`, '#marketing'].filter((tag) => tag !== '#');
}

function mapConnectionRow(row: Record<string, unknown>): SocialConnection {
  const config = configFromRow(row);
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    platform: row.platform as string,
    account_name: row.account_name as string | null,
    account_id: row.account_id as string | null,
    status: row.status as string,
    config: publicConfig(config),
    last_sync_at: row.last_sync_at as string | null,
    created_at: row.created_at as string,
  };
}

function mapPostRow(row: Record<string, unknown>): SocialPost {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    connection_id: row.connection_id as string | null,
    content_id: row.content_id as string | null,
    campaign_id: row.campaign_id as string | null,
    platform: row.platform as string,
    body: row.body as string | null,
    media_urls: typeof row.media_urls === 'string' ? JSON.parse(row.media_urls) : (row.media_urls as string[]) || [],
    hashtags: typeof row.hashtags === 'string' ? JSON.parse(row.hashtags) : (row.hashtags as string[]) || [],
    status: row.status as string,
    scheduled_at: row.scheduled_at as string | null,
    published_at: row.published_at as string | null,
    external_id: row.external_id as string | null,
    external_url: row.external_url as string | null,
    engagement: typeof row.engagement === 'string' ? JSON.parse(row.engagement) : (row.engagement as Record<string, unknown>) || {},
    provider_response: typeof row.provider_response === 'string' ? JSON.parse(row.provider_response) : (row.provider_response as Record<string, unknown>) || {},
    error: row.error as string | null,
    created_at: row.created_at as string,
  };
}
