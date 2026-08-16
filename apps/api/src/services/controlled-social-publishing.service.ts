import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import {
  publishPost as deliverApprovedSocialPost,
  schedulePost,
  type SocialPost,
} from './social-publishing.service';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';
import { assertApprovedContentVersion } from './approved-content.service';

export async function schedulePostThroughControlCentre(input: {
  organizationId: string;
  connectionId: string;
  body: string;
  userId?: string | null;
  requestedBy?: 'system' | 'user' | 'application';
  contentId: string;
  campaignId?: string;
  mediaUrls?: string[];
  hashtags?: string[];
  scheduledAt: string;
  idempotencyKey?: string;
}): Promise<SocialPost> {
  const connection = await query(
    'SELECT platform FROM social_connections WHERE id=$1 AND organization_id=$2 AND status=\'active\'',
    [input.connectionId, input.organizationId]
  );
  if (connection.rows.length === 0) {
    throw new AppError(400, 'An active organization-owned social connection is required', 'SOCIAL_CONNECTION_INVALID');
  }
  const binding = await assertApprovedContentVersion({
    organizationId: input.organizationId,
    contentId: input.contentId,
    channel: 'social',
    platform: String(connection.rows[0].platform),
    body: input.body,
    mediaUrls: input.mediaUrls,
    hashtags: input.hashtags,
  });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    connectionId: input.connectionId, body: input.body, scheduledAt: input.scheduledAt,
    campaignId: input.campaignId || null, mediaUrls: input.mediaUrls || [], hashtags: input.hashtags || [],
  })).digest('hex');
  const decision = await requireExecutionApproval(input.organizationId, {
    action_type: 'social_schedule', channel: 'social', title: 'Schedule social content',
    summary: input.body.slice(0, 500),
    idempotency_key: input.idempotencyKey || `social-schedule:${fingerprint}`,
    requested_by: input.requestedBy || 'user', requested_by_user_id: input.userId || null,
    payload: {
      connection_id: input.connectionId, campaign_id: input.campaignId || null,
      content_id: binding.contentId, content_version: binding.version,
      approved_content_hash: binding.hash, scheduled_at: input.scheduledAt,
      body_hash: crypto.createHash('sha256').update(input.body).digest('hex'),
    },
  });
  try {
    await markExecutionRunning(decision.id);
    const post = await schedulePost(input.organizationId, input.connectionId, input.body, {
      content_id: input.contentId,
      campaign_id: input.campaignId,
      media_urls: input.mediaUrls,
      hashtags: input.hashtags,
      scheduled_at: input.scheduledAt,
      approved_content_version: binding.version,
      approved_content_hash: binding.hash,
    });
    await markExecutionCompleted(decision.id);
    return post;
  } catch (error) {
    await markExecutionFailed(decision.id, error);
    throw error;
  }
}

function isControlHold(error: unknown): boolean {
  return error instanceof AppError
    && ['RELAUNCH_APPROVAL_REQUIRED', 'RELAUNCH_ACTION_BLOCKED'].includes(error.code);
}

async function executeControlledSocialPost(
  postId: string,
  organizationId: string,
  requestedBy: 'system' | 'user',
  requestedByUserId?: string | null
): Promise<SocialPost> {
  const postResult = await query(
    `SELECT id,organization_id,platform,body,content_id,campaign_id,media_urls,hashtags,
            approved_content_version,approved_content_hash,scheduled_at,status
     FROM social_posts WHERE id=$1 AND organization_id=$2`,
    [postId, organizationId]
  );
  if (postResult.rows.length === 0) throw new NotFoundError('Social post');
  const post = postResult.rows[0];
  if (String(post.status) === 'published') {
    return deliverApprovedSocialPost(postId, organizationId);
  }

  const binding = await assertApprovedContentVersion({
    organizationId,
    contentId: String(post.content_id || ''),
    channel: 'social',
    platform: String(post.platform),
    body: String(post.body || ''),
    mediaUrls: typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : post.media_urls || [],
    hashtags: typeof post.hashtags === 'string' ? JSON.parse(post.hashtags) : post.hashtags || [],
  });
  if (Number(post.approved_content_version || 0) !== binding.version
    || String(post.approved_content_hash || '') !== binding.hash) {
    throw new AppError(409, 'The scheduled post is not bound to the current owner-approved content version', 'CONTENT_APPROVAL_STALE');
  }

  let decisionId: string | null = null;
  let claimed = false;
  try {
    const decision = await requireExecutionApproval(organizationId, {
      action_type: 'social_publish',
      channel: 'social',
      title: `Publish ${String(post.platform)} post`,
      summary: String(post.body || '').slice(0, 500),
      idempotency_key: `social-publish:${postId}`,
      requested_by: requestedBy,
      requested_by_user_id: requestedByUserId || null,
      payload: {
        social_post_id: postId,
        platform: String(post.platform),
        campaign_id: post.campaign_id || null,
        content_id: binding.contentId,
        content_version: binding.version,
        approved_content_hash: binding.hash,
        scheduled_at: post.scheduled_at || null,
      },
    });
    decisionId = decision.id;

    const claim = await query(
      `UPDATE social_posts SET status='publishing',error=NULL,updated_at=NOW()
       WHERE id=$1 AND organization_id=$2 AND status IN ('draft','scheduled','failed')
       RETURNING id`,
      [postId, organizationId]
    );
    if (claim.rows.length === 0) {
      throw new AppError(409, 'The social post is already being processed', 'SOCIAL_POST_ALREADY_PROCESSING');
    }
    claimed = true;

    await markExecutionRunning(decision.id);
    const published = await deliverApprovedSocialPost(postId, organizationId);
    await markExecutionCompleted(decision.id);
    return published;
  } catch (error) {
    if (isControlHold(error)) {
      logger.info(`Social post ${postId} is awaiting Relaunch Control approval`);
      throw error;
    }

    if (claimed) {
      const message = error instanceof Error ? error.message : 'Social publishing failed';
      await query(
        `UPDATE social_posts SET status='failed',error=$1,updated_at=NOW()
         WHERE id=$2 AND organization_id=$3 AND status='publishing'`,
        [message, postId, organizationId]
      );
      if (decisionId) await markExecutionFailed(decisionId, error);
    }
    throw error;
  }
}

export async function publishPostThroughControlCentre(
  postId: string,
  organizationId: string,
  userId: string
): Promise<SocialPost> {
  return executeControlledSocialPost(postId, organizationId, 'user', userId);
}

export async function publishDuePostsThroughControlCentre(limit = 20): Promise<number> {
  const due = await query(
    `SELECT id,organization_id
     FROM social_posts
     WHERE status='scheduled' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT $1`,
    [limit]
  );

  let published = 0;
  for (const row of due.rows) {
    try {
      await executeControlledSocialPost(
        String(row.id),
        String(row.organization_id),
        'system',
        null
      );
      published++;
    } catch (error) {
      if (!isControlHold(error)) {
        logger.error(`Controlled scheduled social post ${row.id} failed`, error);
      }
    }
  }
  return published;
}
