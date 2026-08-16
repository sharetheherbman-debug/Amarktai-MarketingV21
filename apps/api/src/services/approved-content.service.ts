import crypto from 'crypto';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';

type ContentRow = Record<string, unknown>;

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function approvedContentHash(content: ContentRow): string {
  const snapshot = {
    id: String(content.id),
    version: Number(content.version || 1),
    title: String(content.title || ''),
    body: String(content.body || ''),
    type: String(content.type || ''),
    format: String(content.format || ''),
    platform: content.platform ? String(content.platform) : null,
    metadata: objectValue(content.metadata),
  };
  return crypto.createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}

export interface ApprovedContentBinding {
  contentId: string;
  version: number;
  hash: string;
}

export async function assertApprovedContentVersion(input: {
  organizationId: string;
  contentId: string;
  channel: 'content' | 'social' | 'email' | 'seo';
  platform?: string;
  body?: string;
  subject?: string;
  mediaUrls?: string[];
  hashtags?: string[];
}): Promise<ApprovedContentBinding> {
  if (!input.contentId) {
    throw new AppError(409, 'External delivery requires an owner-approved content version', 'CONTENT_APPROVAL_REQUIRED');
  }
  const result = await query(
    `SELECT content.*,approval.content_version,approval.approved_content_hash,
            approval.reviewed_by,member.role AS reviewer_role
     FROM content_items content
     JOIN content_approvals approval
       ON approval.content_id=content.id
      AND approval.organization_id=content.organization_id
      AND approval.status='approved'
      AND approval.content_version=content.version
     LEFT JOIN organization_members member
       ON member.organization_id=content.organization_id
      AND member.user_id=approval.reviewed_by
     WHERE content.id=$1 AND content.organization_id=$2
       AND content.deleted_at IS NULL
     ORDER BY approval.reviewed_at DESC NULLS LAST
     LIMIT 1`,
    [input.contentId, input.organizationId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Approved content version');
  const content = result.rows[0] as ContentRow;
  if (String(content.status) !== 'approved' || String(content.reviewer_role) !== 'owner') {
    throw new AppError(409, 'The exact content version has not been approved by the owner', 'CONTENT_OWNER_APPROVAL_REQUIRED');
  }
  const currentHash = approvedContentHash(content);
  if (!content.approved_content_hash || String(content.approved_content_hash) !== currentHash) {
    throw new AppError(409, 'The approved content snapshot is missing or stale', 'CONTENT_APPROVAL_STALE');
  }

  const metadata = objectValue(content.metadata);
  const delivery = objectValue(metadata.delivery);
  if (input.channel === 'social') {
    const social = objectValue(delivery.social);
    const expectedBody = String(social.body ?? content.body ?? '');
    const expectedPlatform = String(social.platform ?? content.platform ?? '').toLowerCase();
    const expectedMedia = stringArray(social.media_urls ?? metadata.media_urls);
    const expectedHashtags = stringArray(social.hashtags ?? metadata.hashtags);
    if (String(input.body || '') !== expectedBody
      || (expectedPlatform && String(input.platform || '').toLowerCase() !== expectedPlatform)
      || canonicalJson(stringArray(input.mediaUrls)) !== canonicalJson(expectedMedia)
      || canonicalJson(stringArray(input.hashtags)) !== canonicalJson(expectedHashtags)) {
      throw new AppError(409, 'The social payload differs from the owner-approved content version', 'CONTENT_APPROVAL_PAYLOAD_MISMATCH');
    }
  }
  if (input.channel === 'email') {
    const email = objectValue(delivery.email);
    const expectedSubject = String(email.subject ?? metadata.subject ?? content.title ?? '');
    const expectedBody = String(email.html ?? content.body ?? '');
    if (String(input.subject || '') !== expectedSubject || String(input.body || '') !== expectedBody) {
      throw new AppError(409, 'The email payload differs from the owner-approved content version', 'CONTENT_APPROVAL_PAYLOAD_MISMATCH');
    }
  }

  return { contentId: String(content.id), version: Number(content.version), hash: currentHash };
}
