import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { publishPost } from './social-publishing.service';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';

function isControlHold(error: unknown): boolean {
  return error instanceof AppError
    && ['RELAUNCH_APPROVAL_REQUIRED', 'RELAUNCH_ACTION_BLOCKED'].includes(error.code);
}

async function publishControlledScheduledPost(
  postId: string,
  organizationId: string,
  platform: string,
  body: string,
  campaignId: string | null,
  scheduledAt: string | null
): Promise<boolean> {
  let decisionId: string | null = null;
  let claimed = false;
  try {
    const decision = await requireExecutionApproval(organizationId, {
      action_type: 'social_publish',
      channel: 'social',
      title: `Publish ${platform} post`,
      summary: body.slice(0, 500),
      idempotency_key: `social-publish:${postId}`,
      requested_by: 'system',
      payload: {
        social_post_id: postId,
        platform,
        campaign_id: campaignId,
        scheduled_at: scheduledAt,
      },
    });
    decisionId = decision.id;

    const claim = await query(
      `UPDATE social_posts SET status='publishing',error=NULL,updated_at=NOW()
       WHERE id=$1 AND organization_id=$2 AND status='scheduled'
       RETURNING id`,
      [postId, organizationId]
    );
    if (claim.rows.length === 0) return false;
    claimed = true;

    await markExecutionRunning(decision.id);
    await publishPost(postId, organizationId);
    await markExecutionCompleted(decision.id);
    return true;
  } catch (error) {
    if (isControlHold(error)) {
      logger.info(`Scheduled social post ${postId} is awaiting Relaunch Control approval`);
      return false;
    }

    if (claimed) {
      const message = error instanceof Error ? error.message : 'Scheduled social publishing failed';
      await query(
        `UPDATE social_posts SET status='failed',error=$1,updated_at=NOW()
         WHERE id=$2 AND organization_id=$3 AND status='publishing'`,
        [message, postId, organizationId]
      );
    }
    if (decisionId) await markExecutionFailed(decisionId, error);
    logger.error(`Controlled social post ${postId} failed`, error);
    return false;
  }
}

export async function publishDuePostsThroughControlCentre(limit = 20): Promise<number> {
  const due = await query(
    `SELECT id,organization_id,platform,body,campaign_id,scheduled_at
     FROM social_posts
     WHERE status='scheduled' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT $1`,
    [limit]
  );

  let published = 0;
  for (const row of due.rows) {
    const completed = await publishControlledScheduledPost(
      String(row.id),
      String(row.organization_id),
      String(row.platform),
      String(row.body || ''),
      row.campaign_id ? String(row.campaign_id) : null,
      row.scheduled_at ? String(row.scheduled_at) : null
    );
    if (completed) published++;
  }
  return published;
}
