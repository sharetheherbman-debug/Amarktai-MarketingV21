import { query, transaction } from '../config/database';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ContentApproval, ContentStatus } from '../types';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';

export async function submitForReview(contentId: string, orgId: string, assignedTo: string, userId: string): Promise<ContentApproval> {
  const content = await query(
    `SELECT id,version,quality_score FROM content_items
     WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
    [contentId, orgId]
  );
  if (content.rows.length === 0) throw new NotFoundError('Content');
  const qualityState = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE checks.passed=FALSE)::int AS failing
     FROM content_quality_checks checks
     WHERE checks.content_id=$1 AND checks.organization_id=$2
       AND checks.created_at >= COALESCE((SELECT MAX(created_at) FROM content_versions WHERE content_id=$1),'-infinity')`,
    [contentId, orgId]
  );
  if (Number(qualityState.rows[0]?.total || 0) === 0 || Number(qualityState.rows[0]?.failing || 0) > 0) {
    throw new AppError(409, 'Resolve the latest content quality checks before review', 'CONTENT_QUALITY_REQUIRED');
  }
  const approval = await transaction(async (client) => {
    await client.query(
      "UPDATE content_items SET status='review',workflow_state='review',assigned_to=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3",
      [assignedTo, contentId, orgId]
    );
    const result = await client.query(
      `INSERT INTO content_approvals (content_id,organization_id,status,assigned_to,content_version)
       VALUES ($1,$2,'pending',$3,$4) RETURNING *`,
      [contentId, orgId, assignedTo, Number(content.rows[0].version || 1)]
    );
    return result.rows[0];
  });

  logger.info(`Content ${contentId} submitted for review to ${assignedTo}`);
  return mapRow(approval);
}

export async function approve(contentId: string, orgId: string, reviewerId: string, comments?: string): Promise<ContentApproval> {
  const approval = await transaction(async (client) => {
    const result = await client.query(
      `UPDATE content_approvals approval SET
         status='approved',reviewed_by=$1,reviewed_at=NOW(),comments=$2
       FROM content_items content
       WHERE approval.content_id=$3 AND approval.organization_id=$4
         AND approval.status='pending' AND approval.assigned_to=$1
         AND content.id=approval.content_id AND content.organization_id=approval.organization_id
         AND content.version=approval.content_version
       RETURNING approval.*`,
      [reviewerId, comments || null, contentId, orgId]
    );
    if (result.rows.length === 0) {
      throw new AppError(409, 'The approval is missing, assigned elsewhere, or belongs to an older content version', 'CONTENT_APPROVAL_STALE');
    }
    await client.query(
      "UPDATE content_items SET status='approved',workflow_state='approved',approved_by=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3",
      [reviewerId, contentId, orgId]
    );
    return result.rows[0];
  });

  logger.info(`Content ${contentId} approved by ${reviewerId}`);
  return mapRow(approval);
}

export async function reject(contentId: string, orgId: string, reviewerId: string, comments: string): Promise<ContentApproval> {
  const approval = await transaction(async (client) => {
    const result = await client.query(
      `UPDATE content_approvals approval SET
         status='rejected',reviewed_by=$1,reviewed_at=NOW(),comments=$2
       FROM content_items content
       WHERE approval.content_id=$3 AND approval.organization_id=$4
         AND approval.status='pending' AND approval.assigned_to=$1
         AND content.id=approval.content_id AND content.organization_id=approval.organization_id
         AND content.version=approval.content_version
       RETURNING approval.*`,
      [reviewerId, comments, contentId, orgId]
    );
    if (result.rows.length === 0) {
      throw new AppError(409, 'The review is missing, assigned elsewhere, or belongs to an older content version', 'CONTENT_APPROVAL_STALE');
    }
    await client.query(
      "UPDATE content_items SET status='rejected',workflow_state='rejected',updated_at=NOW() WHERE id=$1 AND organization_id=$2",
      [contentId, orgId]
    );
    return result.rows[0];
  });

  logger.info(`Content ${contentId} rejected by ${reviewerId}`);
  return mapRow(approval);
}

export async function requestChanges(contentId: string, orgId: string, reviewerId: string, comments: string): Promise<ContentApproval> {
  const approval = await transaction(async (client) => {
    const result = await client.query(
      `UPDATE content_approvals approval SET
         status='changes_requested',reviewed_by=$1,reviewed_at=NOW(),comments=$2
       FROM content_items content
       WHERE approval.content_id=$3 AND approval.organization_id=$4
         AND approval.status='pending' AND approval.assigned_to=$1
         AND content.id=approval.content_id AND content.organization_id=approval.organization_id
         AND content.version=approval.content_version
       RETURNING approval.*`,
      [reviewerId, comments, contentId, orgId]
    );
    if (result.rows.length === 0) {
      throw new AppError(409, 'The review is missing, assigned elsewhere, or belongs to an older content version', 'CONTENT_APPROVAL_STALE');
    }
    await client.query(
      "UPDATE content_items SET status='draft',workflow_state='changes_requested',updated_at=NOW() WHERE id=$1 AND organization_id=$2",
      [contentId, orgId]
    );
    return result.rows[0];
  });

  logger.info(`Changes requested for content ${contentId} by ${reviewerId}`);
  return mapRow(approval);
}

export async function publish(contentId: string, orgId: string, userId: string): Promise<void> {
  const content = await query(
    `SELECT id,title,type,platform,campaign_id,version,status FROM content_items
     WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
    [contentId, orgId]
  );
  if (content.rows.length === 0) throw new NotFoundError('Content');
  if (String(content.rows[0].status) !== 'approved') {
    throw new AppError(409, 'Content must be approved before publication', 'CONTENT_APPROVAL_REQUIRED');
  }
  const decision = await requireExecutionApproval(orgId, {
    action_type: 'content_publish', channel: 'content', title: `Publish ${String(content.rows[0].title)}`,
    summary: `${String(content.rows[0].type)} for ${String(content.rows[0].platform || 'web')}`,
    idempotency_key: `content-publish:${contentId}:v${Number(content.rows[0].version)}`,
    requested_by: 'user', requested_by_user_id: userId,
    payload: { content_id: contentId, version: Number(content.rows[0].version), campaign_id: content.rows[0].campaign_id || null },
  });
  try {
    await markExecutionRunning(decision.id);
    await query(
      "UPDATE content_items SET status='published',workflow_state='published',published_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND status='approved'",
      [contentId, orgId]
    );
    await markExecutionCompleted(decision.id);
    logger.info(`Content ${contentId} published through Relaunch Control`);
  } catch (error) {
    await markExecutionFailed(decision.id, error);
    throw error;
  }
}

export async function archive(contentId: string, orgId: string): Promise<void> {
  await query(
    "UPDATE content_items SET status = 'archived', workflow_state = 'archived', archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2",
    [contentId, orgId]
  );
  logger.info(`Content ${contentId} archived`);
}

export async function getApprovalQueue(orgId: string): Promise<ContentApproval[]> {
  const result = await query(
    `SELECT ca.*, ci.title as content_title, ci.type as content_type
     FROM content_approvals ca
     JOIN content_items ci ON ca.content_id = ci.id
     WHERE ca.organization_id = $1 AND ca.status = 'pending'
     ORDER BY ca.created_at ASC`,
    [orgId]
  );
  return result.rows.map(mapRow);
}

export async function getApprovalHistory(contentId: string, orgId: string): Promise<ContentApproval[]> {
  const result = await query(
    'SELECT * FROM content_approvals WHERE content_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
    [contentId, orgId]
  );
  return result.rows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): ContentApproval {
  return {
    id: row.id as string,
    content_id: row.content_id as string,
    organization_id: row.organization_id as string,
    status: row.status as ContentApproval['status'],
    assigned_to: row.assigned_to as string | null,
    comments: row.comments as string | null,
    reviewed_by: row.reviewed_by as string | null,
    reviewed_at: row.reviewed_at as string | null,
    created_at: row.created_at as string,
  };
}
