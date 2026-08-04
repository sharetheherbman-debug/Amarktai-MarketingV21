import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { ContentApproval, ContentStatus } from '../types';

export async function submitForReview(contentId: string, orgId: string, assignedTo: string, userId: string): Promise<ContentApproval> {
  // Update content status
  await query(
    "UPDATE content_items SET status = 'review', workflow_state = 'review', assigned_to = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3",
    [assignedTo, contentId, orgId]
  );

  // Create approval record
  const result = await query(
    `INSERT INTO content_approvals (content_id, organization_id, status, assigned_to)
     VALUES ($1, $2, 'pending', $3) RETURNING *`,
    [contentId, orgId, assignedTo]
  );

  logger.info(`Content ${contentId} submitted for review to ${assignedTo}`);
  return mapRow(result.rows[0]);
}

export async function approve(contentId: string, orgId: string, reviewerId: string, comments?: string): Promise<ContentApproval> {
  await query(
    "UPDATE content_items SET status = 'approved', workflow_state = 'approved', approved_by = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3",
    [reviewerId, contentId, orgId]
  );

  const result = await query(
    `UPDATE content_approvals SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), comments = $2
     WHERE content_id = $3 AND organization_id = $4 AND status = 'pending' RETURNING *`,
    [reviewerId, comments || null, contentId, orgId]
  );

  logger.info(`Content ${contentId} approved by ${reviewerId}`);
  return mapRow(result.rows[0]);
}

export async function reject(contentId: string, orgId: string, reviewerId: string, comments: string): Promise<ContentApproval> {
  await query(
    "UPDATE content_items SET status = 'rejected', workflow_state = 'rejected', updated_at = NOW() WHERE id = $1 AND organization_id = $2",
    [contentId, orgId]
  );

  const result = await query(
    `UPDATE content_approvals SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), comments = $2
     WHERE content_id = $3 AND organization_id = $4 AND status = 'pending' RETURNING *`,
    [reviewerId, comments, contentId, orgId]
  );

  logger.info(`Content ${contentId} rejected by ${reviewerId}`);
  return mapRow(result.rows[0]);
}

export async function requestChanges(contentId: string, orgId: string, reviewerId: string, comments: string): Promise<ContentApproval> {
  await query(
    "UPDATE content_items SET status = 'draft', workflow_state = 'changes_requested', updated_at = NOW() WHERE id = $1 AND organization_id = $2",
    [contentId, orgId]
  );

  const result = await query(
    `UPDATE content_approvals SET status = 'changes_requested', reviewed_by = $1, reviewed_at = NOW(), comments = $2
     WHERE content_id = $3 AND organization_id = $4 AND status = 'pending' RETURNING *`,
    [reviewerId, comments, contentId, orgId]
  );

  logger.info(`Changes requested for content ${contentId} by ${reviewerId}`);
  return mapRow(result.rows[0]);
}

export async function publish(contentId: string, orgId: string, userId: string): Promise<void> {
  await query(
    "UPDATE content_items SET status = 'published', workflow_state = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2",
    [contentId, orgId]
  );
  logger.info(`Content ${contentId} published`);
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
