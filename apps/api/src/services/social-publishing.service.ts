import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  error: string | null;
  created_at: string;
}

// ─── Connection Management ───────────────────────────────────────────────────

export async function listConnections(orgId: string): Promise<SocialConnection[]> {
  const result = await query(
    'SELECT * FROM social_connections WHERE organization_id = $1 ORDER BY platform ASC',
    [orgId]
  );
  return result.rows.map(mapConnectionRow);
}

export async function addConnection(orgId: string, platform: string, accountName: string, config?: Record<string, unknown>): Promise<SocialConnection> {
  const result = await query(
    `INSERT INTO social_connections (organization_id, platform, account_name, config)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [orgId, platform, accountName, JSON.stringify(config || {})]
  );
  logger.info(`Social connection added: ${platform} (${accountName}) for org: ${orgId}`);
  return mapConnectionRow(result.rows[0]);
}

export async function removeConnection(id: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM social_connections WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Social connection');
}

// ─── Publishing ──────────────────────────────────────────────────────────────

export async function schedulePost(
  orgId: string,
  connectionId: string,
  body: string,
  options?: { content_id?: string; campaign_id?: string; media_urls?: string[]; hashtags?: string[]; scheduled_at?: string }
): Promise<SocialPost> {
  const result = await query(
    `INSERT INTO social_posts (organization_id, connection_id, content_id, campaign_id, platform, body, media_urls, hashtags, status, scheduled_at)
     VALUES ($1, $2, $3, $4, (SELECT platform FROM social_connections WHERE id = $2), $5, $6, $7, $8, $9) RETURNING *`,
    [
      orgId, connectionId, options?.content_id || null, options?.campaign_id || null,
      body, JSON.stringify(options?.media_urls || []), JSON.stringify(options?.hashtags || []),
      options?.scheduled_at ? 'scheduled' : 'draft',
      options?.scheduled_at || null,
    ]
  );
  logger.info(`Social post scheduled for connection ${connectionId}`);
  return mapPostRow(result.rows[0]);
}

export async function publishPost(postId: string, orgId: string): Promise<SocialPost> {
  const postResult = await query(
    'SELECT * FROM social_posts WHERE id = $1 AND organization_id = $2',
    [postId, orgId]
  );
  if (postResult.rows.length === 0) throw new NotFoundError('Social post');

  const post = postResult.rows[0];

  // In production, this would call the platform API
  // For now, mark as published
  await query(
    `UPDATE social_posts SET status = 'published', published_at = NOW(), external_id = $1, external_url = $2 WHERE id = $3`,
    [`ext_${Date.now()}`, `https://${post.platform}.com/post/${Date.now()}`, postId]
  );

  logger.info(`Social post ${postId} published to ${post.platform}`);
  return { ...mapPostRow(post), status: 'published', published_at: new Date().toISOString() };
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

export async function getUpcomingPosts(orgId: string, days: number = 7): Promise<SocialPost[]> {
  const result = await query(
    `SELECT * FROM social_posts WHERE organization_id = $1 AND status = 'scheduled'
     AND scheduled_at <= CURRENT_DATE + INTERVAL '${days} days'
     ORDER BY scheduled_at ASC`,
    [orgId]
  );
  return result.rows.map(mapPostRow);
}

// ─── Platform Content Formatting ─────────────────────────────────────────────

export function formatForPlatform(platform: string, body: string, maxLength?: number): string {
  const limits: Record<string, number> = {
    x: 280, threads: 500, facebook: 63206, instagram: 2200, linkedin: 3000,
    pinterest: 500, reddit: 40000, youtube: 5000,
  };

  const limit = maxLength || limits[platform] || 2000;
  if (body.length <= limit) return body;
  return body.substring(0, limit - 3) + '...';
}

export function getHashtagsForPlatform(platform: string, topic: string): string[] {
  // In production, this would use AI or hashtag API
  const base = topic.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return [`#${base}`, '#marketing', '#amarktai'];
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapConnectionRow(row: Record<string, unknown>): SocialConnection {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    platform: row.platform as string,
    account_name: row.account_name as string | null,
    account_id: row.account_id as string | null,
    status: row.status as string,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
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
    error: row.error as string | null,
    created_at: row.created_at as string,
  };
}
