import { AppError } from '../middleware/errorHandler';
import { deliverEmail, type EmailDeliveryResult } from './email-delivery.service';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';

export interface ControlledEmailDelivery {
  to: string;
  subject: string;
  html: string;
}

export interface ControlledEmailBatchRequest {
  organizationId: string;
  deliveries: ControlledEmailDelivery[];
  actionTitle: string;
  actionSummary?: string;
  idempotencyKey: string;
  requestedByUserId?: string | null;
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

  const decision = await requireExecutionApproval(request.organizationId, {
    action_type: 'email_send',
    channel: 'email',
    title: request.actionTitle,
    summary: request.actionSummary,
    requested_credits: 0,
    requested_ad_spend_pence: 0,
    idempotency_key: request.idempotencyKey,
    requested_by: 'user',
    requested_by_user_id: request.requestedByUserId || null,
    payload: {
      recipient_count: request.deliveries.length,
      ...(request.payload || {}),
    },
  });

  let running = false;
  try {
    await markExecutionRunning(decision.id);
    running = true;

    const results: Array<EmailDeliveryResult & { recipient: string }> = [];
    for (const delivery of request.deliveries) {
      results.push({
        recipient: delivery.to.trim().toLowerCase(),
        ...(await deliverEmail(
          request.organizationId,
          delivery.to,
          delivery.subject,
          delivery.html
        )),
      });
    }

    await markExecutionCompleted(decision.id);
    return { decision_id: decision.id, deliveries: results };
  } catch (error) {
    if (running) await markExecutionFailed(decision.id, error);
    throw error;
  }
}
