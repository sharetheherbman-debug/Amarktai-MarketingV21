import { AppError } from '../middleware/errorHandler';
import { deliverEmail, type EmailDeliveryResult } from './email-delivery.service';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';
import { assertApprovedContentVersion } from './approved-content.service';
import crypto from 'crypto';
import { query } from '../config/database';

export interface ControlledEmailDelivery {
  to: string;
  subject: string;
  html: string;
  consent_basis: 'consent' | 'contract' | 'legitimate_interest';
}

export interface ControlledEmailBatchRequest {
  organizationId: string;
  contentId: string;
  deliveries: ControlledEmailDelivery[];
  actionTitle: string;
  actionSummary?: string;
  idempotencyKey: string;
  requestedByUserId?: string | null;
  requestedBy?: 'system' | 'user' | 'application';
  payload?: Record<string, unknown>;
}

export interface ControlledEmailBatchResult {
  decision_id: string;
  deliveries: Array<EmailDeliveryResult & { recipient: string }>;
}

/**
 * Deliver a batch of external email only after the Relaunch Control Centre has
 * approved the action. The low-level provider sender deliberately lives behind
 * this wrapper so emergency stop, manual mode and approval thresholds apply
 * before the first external message leaves the platform.
 */
export async function deliverEmailBatchThroughControlCentre(
  request: ControlledEmailBatchRequest
): Promise<ControlledEmailBatchResult> {
  if (request.deliveries.length === 0) {
    throw new AppError(400, 'At least one email delivery is required', 'EMAIL_DELIVERY_REQUIRED');
  }
  if (!request.idempotencyKey.trim()) {
    throw new AppError(400, 'Email idempotency key is required', 'EMAIL_IDEMPOTENCY_REQUIRED');
  }

  const bindings = await Promise.all(request.deliveries.map((delivery) => assertApprovedContentVersion({
    organizationId: request.organizationId,
    contentId: request.contentId,
    channel: 'email',
    subject: delivery.subject,
    body: delivery.html,
  })));
  const binding = bindings[0];

  const decision = await requireExecutionApproval(request.organizationId, {
    action_type: 'email_send',
    channel: 'email',
    title: request.actionTitle,
    summary: request.actionSummary,
    requested_credits: 0,
    requested_ad_spend_pence: 0,
    idempotency_key: request.idempotencyKey,
    requested_by: request.requestedBy || 'user',
    requested_by_user_id: request.requestedByUserId || null,
    payload: {
      recipient_count: request.deliveries.length,
      content_id: binding.contentId,
      content_version: binding.version,
      approved_content_hash: binding.hash,
      ...(request.payload || {}),
    },
  });

  let running = false;
  try {
    await markExecutionRunning(decision.id);
    running = true;

    const results: Array<EmailDeliveryResult & { recipient: string }> = [];
    for (const delivery of request.deliveries) {
      const recipient = delivery.to.trim().toLowerCase();
      const deliveryKey = crypto.createHash('sha256').update(`${request.idempotencyKey}|${recipient}`).digest('hex');
      const prior = await query(
        `SELECT provider,provider_message_id,status_code FROM email_delivery_log
         WHERE organization_id=$1 AND idempotency_key=$2 AND status='delivered'`,
        [request.organizationId, deliveryKey]
      );
      if (prior.rows.length > 0) {
        results.push({ recipient, delivered: true, provider: String(prior.rows[0].provider), provider_message_id: prior.rows[0].provider_message_id || undefined, status: Number(prior.rows[0].status_code) });
        continue;
      }
      const claimed = await query(
        `INSERT INTO email_delivery_log
           (organization_id,content_id,content_version,approved_content_hash,recipient_hash,idempotency_key,
            provider,status,status_code,consent_basis,attempt_count,last_attempt_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending','sending',0,$7,1,NOW())
         ON CONFLICT (organization_id,idempotency_key)
         DO UPDATE SET status='sending',error_message=NULL,
                       attempt_count=email_delivery_log.attempt_count+1,last_attempt_at=NOW()
         WHERE email_delivery_log.status='failed'
         RETURNING id`,
        [request.organizationId, binding.contentId, binding.version, binding.hash,
          crypto.createHash('sha256').update(recipient).digest('hex'), deliveryKey, delivery.consent_basis]
      );
      if (claimed.rows.length === 0) throw new AppError(409, 'This recipient delivery is already being processed', 'EMAIL_DELIVERY_ALREADY_PROCESSING');
      try {
        const delivered = await deliverEmail(
          request.organizationId,
          delivery.to,
          delivery.subject,
          delivery.html,
          delivery.consent_basis,
          deliveryKey
        );
        results.push({ recipient, ...delivered });
        await query(
          `UPDATE email_delivery_log SET provider=$1,provider_message_id=$2,status='delivered',status_code=$3,
                  delivered_at=NOW(),error_message=NULL,last_attempt_at=NOW()
           WHERE organization_id=$4 AND idempotency_key=$5 AND status='sending'`,
          [delivered.provider, delivered.provider_message_id || null, delivered.status, request.organizationId, deliveryKey]
        );
      } catch (error) {
        await query(
          `UPDATE email_delivery_log SET status='failed',error_message=$1,last_attempt_at=NOW()
           WHERE organization_id=$2 AND idempotency_key=$3 AND status='sending'`,
          [error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000), request.organizationId, deliveryKey]
        );
        throw error;
      }
    }

    await markExecutionCompleted(decision.id);
    return { decision_id: decision.id, deliveries: results };
  } catch (error) {
    if (running) await markExecutionFailed(decision.id, error);
    throw error;
  }
}
