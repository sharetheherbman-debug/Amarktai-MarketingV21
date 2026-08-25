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
import { approvedContentHash, assertApprovedContentVersion } from './approved-content.service';
import type { PoolClient } from 'pg';

async function recordOwnerFeedback(
  client: PoolClient,
  orgId: string,
  content: Record<string, unknown>,
  decision: 'approved' | 'rejected' | 'changes_requested',
  comments?: string
): Promise<void> {
  const key = `${String(content.type || 'content')}:${String(content.platform || 'any')}`.slice(0, 255);
  const delta = decision === 'approved' ? 0.2 : decision === 'rejected' ? -0.2 : -0.1;
  await client.query(
    `INSERT INTO owner_marketing_preferences
       (organization_id,preference_type,preference_key,weight,evidence_count,examples)
     VALUES ($1,'content_decision',$2,$3,1,$4)
     ON CONFLICT (organization_id,preference_type,preference_key)
     DO UPDATE SET weight=GREATEST(0.1,LEAST(10,owner_marketing_preferences.weight+$5)),
                   evidence_count=owner_marketing_preferences.evidence_count+1,
                   examples=EXCLUDED.examples,updated_at=NOW()`,
    [orgId, key, 1 + delta, JSON.stringify([{ content_id: content.id, decision, comments: comments || null }]), delta]
  );
}

async function markCampaignAssetDecision(
  client: PoolClient,
  content: Record<string, unknown>,
  orgId: string,
  reviewerId: string,
  approvalId: string,
  decision: 'approved' | 'rejected' | 'changes_requested',
  comments?: string
): Promise<void> {
  const resolution = decision === 'approved'
    ? 'approved'
    : decision === 'rejected' ? 'rejection_received' : 'revision_requested';
  const feedback = JSON.stringify({
    approval_id: approvalId,
    decision,
    comments: comments || '',
    reviewer_id: reviewerId,
    content_version: Number(content.version || 1),
    received_at: new Date().toISOString(),
  });
  const runs = await client.query(
    `UPDATE campaign_asset_runs SET resolution_status=$1,owner_feedback=$2,
       resolved_content_version=$4,resolution_reason=$5,
       resolved_at=CASE WHEN $3::boolean THEN NOW() ELSE NULL END,updated_at=NOW()
     WHERE organization_id=$6 AND content_id=$7
     RETURNING id,campaign_plan_id`,
    [resolution, feedback, decision === 'approved', Number(content.version || 1), comments || null, orgId, content.id]
  );
  if (decision !== 'approved') return;
  for (const run of runs.rows) {
    await client.query(
      `INSERT INTO campaign_asset_resolution_events
         (organization_id,campaign_plan_id,campaign_asset_run_id,content_id,content_version,resolution_status,reason,detail)
       VALUES ($1,$2,$3,$4,$5,'approved',$6,$7)`,
      [orgId, run.campaign_plan_id, run.id, content.id, Number(content.version || 1), comments || null, feedback]
    );
  }
}

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
  const owner = await query(
    "SELECT user_id FROM organization_members WHERE organization_id=$1 AND role='owner' ORDER BY created_at ASC LIMIT 1",
    [orgId]
  );
  if (owner.rows.length === 0) throw new AppError(409, 'Workspace owner is required for content approval', 'CONTENT_OWNER_REQUIRED');
  const ownerId = String(owner.rows[0].user_id);
  const approval = await transaction(async (client) => {
    await client.query(
      "UPDATE content_items SET status='review',workflow_state='review',assigned_to=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3",
      [ownerId, contentId, orgId]
    );
    const result = await client.query(
      `INSERT INTO content_approvals (content_id,organization_id,status,assigned_to,content_version)
       VALUES ($1,$2,'pending',$3,$4) RETURNING *`,
      [contentId, orgId, ownerId, Number(content.rows[0].version || 1)]
    );
    return result.rows[0];
  });

  logger.info(`Content ${contentId} submitted for owner review (${ownerId}); requester assignment ${assignedTo || userId} was not used as an approval bypass`);
  return mapRow(approval);
}

export async function approve(contentId: string, orgId: string, reviewerId: string, comments?: string): Promise<ContentApproval> {
  const approval = await transaction(async (client) => {
    const contentResult = await client.query(
      `SELECT content.* FROM content_items content
       JOIN organization_members member
         ON member.organization_id=content.organization_id
        AND member.user_id=$1 AND member.role='owner'
       WHERE content.id=$2 AND content.organization_id=$3
         AND content.deleted_at IS NULL
       FOR UPDATE`,
      [reviewerId, contentId, orgId]
    );
    if (contentResult.rows.length === 0) {
      throw new AppError(403, 'Only the workspace owner may approve customer-facing content', 'OWNER_APPROVAL_REQUIRED');
    }
    const contentHash = approvedContentHash(contentResult.rows[0]);
    const result = await client.query(
      `UPDATE content_approvals approval SET
         status='approved',reviewed_by=$1,reviewed_at=NOW(),comments=$2,
         approved_content_hash=$5
       FROM content_items content
       WHERE approval.content_id=$3 AND approval.organization_id=$4
         AND approval.status='pending' AND approval.assigned_to=$1
         AND content.id=approval.content_id AND content.organization_id=approval.organization_id
         AND content.version=approval.content_version
       RETURNING approval.*`,
      [reviewerId, comments || null, contentId, orgId, contentHash]
    );
    if (result.rows.length === 0) {
      throw new AppError(409, 'The approval is missing, assigned elsewhere, or belongs to an older content version', 'CONTENT_APPROVAL_STALE');
    }
    await client.query(
      "UPDATE content_items SET status='approved',workflow_state='approved',approved_by=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3",
      [reviewerId, contentId, orgId]
    );
    await recordOwnerFeedback(client, orgId, contentResult.rows[0], 'approved', comments);
    await markCampaignAssetDecision(client, contentResult.rows[0], orgId, reviewerId, String(result.rows[0].id), 'approved', comments);
    return result.rows[0];
  });

  logger.info(`Content ${contentId} approved by ${reviewerId}`);
  return mapRow(approval);
}

export async function reject(contentId: string, orgId: string, reviewerId: string, comments: string): Promise<ContentApproval> {
  const approval = await transaction(async (client) => {
    const contentResult = await client.query(
      `SELECT content.* FROM content_items content
       JOIN organization_members member
         ON member.organization_id=content.organization_id
        AND member.user_id=$1 AND member.role='owner'
       WHERE content.id=$2 AND content.organization_id=$3
         AND content.deleted_at IS NULL
       FOR UPDATE`,
      [reviewerId, contentId, orgId]
    );
    if (contentResult.rows.length === 0) throw new AppError(403, 'Only the workspace owner may reject customer-facing content', 'OWNER_APPROVAL_REQUIRED');
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
    await recordOwnerFeedback(client, orgId, contentResult.rows[0], 'rejected', comments);
    await markCampaignAssetDecision(client, contentResult.rows[0], orgId, reviewerId, String(result.rows[0].id), 'rejected', comments);
    return result.rows[0];
  });

  logger.info(`Content ${contentId} rejected by ${reviewerId}`);
  return mapRow(approval);
}

export async function requestChanges(contentId: string, orgId: string, reviewerId: string, comments: string): Promise<ContentApproval> {
  const approval = await transaction(async (client) => {
    const contentResult = await client.query(
      `SELECT content.* FROM content_items content
       JOIN organization_members member
         ON member.organization_id=content.organization_id
        AND member.user_id=$1 AND member.role='owner'
       WHERE content.id=$2 AND content.organization_id=$3
         AND content.deleted_at IS NULL
       FOR UPDATE`,
      [reviewerId, contentId, orgId]
    );
    if (contentResult.rows.length === 0) throw new AppError(403, 'Only the workspace owner may request changes to customer-facing content', 'OWNER_APPROVAL_REQUIRED');
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
    await recordOwnerFeedback(client, orgId, contentResult.rows[0], 'changes_requested', comments);
    await markCampaignAssetDecision(client, contentResult.rows[0], orgId, reviewerId, String(result.rows[0].id), 'changes_requested', comments);
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
  const binding = await assertApprovedContentVersion({
    organizationId: orgId,
    contentId,
    channel: String(content.rows[0].platform || '').toLowerCase() === 'seo' ? 'seo' : 'content',
  });
  const decision = await requireExecutionApproval(orgId, {
    action_type: 'content_publish', channel: 'content', title: `Publish ${String(content.rows[0].title)}`,
    summary: `${String(content.rows[0].type)} for ${String(content.rows[0].platform || 'web')}`,
    idempotency_key: `content-publish:${contentId}:v${Number(content.rows[0].version)}`,
    requested_by: 'user', requested_by_user_id: userId,
    payload: {
      content_id: contentId,
      version: binding.version,
      approved_content_hash: binding.hash,
      campaign_id: content.rows[0].campaign_id || null,
    },
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
