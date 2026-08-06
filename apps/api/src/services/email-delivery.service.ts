import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { safeFetch } from '../utils/safe-fetch';

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

export interface EmailDeliveryResult {
  delivered: true;
  provider: string;
  provider_message_id?: string;
  status: number;
}

export async function deliverEmail(
  organizationId: string,
  to: string,
  subject: string,
  html: string
): Promise<EmailDeliveryResult> {
  const email = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, `Invalid recipient email: ${to}`, 'EMAIL_RECIPIENT_INVALID');
  if (!subject.trim() || !html.trim()) throw new AppError(400, 'Email subject and content are required', 'EMAIL_CONTENT_REQUIRED');

  const result = await query(
    `SELECT * FROM email_providers
     WHERE organization_id=$1 AND is_active=TRUE
     ORDER BY is_default DESC,created_at ASC LIMIT 1`,
    [organizationId]
  );
  if (result.rows.length === 0) throw new AppError(503, 'No active email provider is configured for this organization', 'EMAIL_PROVIDER_REQUIRED');
  const provider = result.rows[0];
  const config = objectValue(provider.config);
  const type = String(provider.provider_type || '').toLowerCase();
  let status = 0;
  let responseText = '';
  let messageId = '';

  try {
    if (type === 'resend') {
      const apiKey = String(config.api_key || '');
      if (!apiKey) throw new AppError(400, 'Resend api_key is missing', 'EMAIL_PROVIDER_CONFIG_ERROR');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: provider.from_name ? `${provider.from_name} <${provider.from_email}>` : provider.from_email, to: [email], subject, html }),
        signal: AbortSignal.timeout(30000),
      });
      status = response.status;
      responseText = await response.text();
      if (!response.ok) throw new AppError(response.status, `Resend failed: ${responseText || response.statusText}`, 'EMAIL_SEND_FAILED');
      try { messageId = String((JSON.parse(responseText) as Record<string, unknown>).id || ''); } catch { /* no id */ }
    } else if (type === 'sendgrid') {
      const apiKey = String(config.api_key || '');
      if (!apiKey) throw new AppError(400, 'SendGrid api_key is missing', 'EMAIL_PROVIDER_CONFIG_ERROR');
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: provider.from_email, name: provider.from_name || undefined },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      status = response.status;
      responseText = await response.text();
      if (!response.ok) throw new AppError(response.status, `SendGrid failed: ${responseText || response.statusText}`, 'EMAIL_SEND_FAILED');
      messageId = response.headers.get('x-message-id') || '';
    } else if (type === 'webhook') {
      const url = String(config.url || '');
      if (!url) throw new AppError(400, 'Email webhook URL is missing', 'EMAIL_PROVIDER_CONFIG_ERROR');
      const response = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...Object.fromEntries(Object.entries(objectValue(config.headers)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) },
        body: JSON.stringify({ to: email, subject, html, from_email: provider.from_email, from_name: provider.from_name }),
        timeoutMs: 30000,
        maxResponseBytes: 1024 * 1024,
      });
      status = response.status;
      responseText = await response.text();
      if (!response.ok) throw new AppError(response.status, `Email webhook failed: ${responseText.slice(0, 500)}`, 'EMAIL_SEND_FAILED');
      try { messageId = String((JSON.parse(responseText) as Record<string, unknown>).id || ''); } catch { /* no id */ }
    } else {
      throw new AppError(400, `Unsupported email provider type: ${type}`, 'EMAIL_PROVIDER_UNSUPPORTED');
    }

    await query("UPDATE email_providers SET sent_today=sent_today+1,health_status='healthy',last_error=NULL WHERE id=$1", [provider.id]);
    return { delivered: true, provider: type, provider_message_id: messageId || undefined, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query("UPDATE email_providers SET health_status='degraded',last_error=$1 WHERE id=$2", [message.slice(0, 2000), provider.id]);
    throw error;
  }
}
