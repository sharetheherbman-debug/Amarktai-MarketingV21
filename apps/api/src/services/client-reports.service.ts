import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { deliverEmail } from './email-delivery.service';

export interface ClientReport {
  id: string; agency_id: string; client_organization_id: string; client_name?: string;
  title: string; report_type: string; period_start: string | null; period_end: string | null;
  content: Record<string, unknown>; summary: string | null; ai_summary: string | null;
  status: string; sent_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}

export interface CreateReportData {
  client_organization_id: string; title: string; report_type: string; period_start?: string;
  period_end?: string; content?: Record<string, unknown>; summary?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderContent(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return `<p>${escapeHtml(value)}</p>`;
  if (Array.isArray(value)) return `<ul>${value.map((item) => `<li>${renderContent(item)}</li>`).join('')}</ul>`;
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'delivery')
      .map(([key, item]) => `<section><h3>${escapeHtml(key.replace(/_/g, ' '))}</h3>${renderContent(item)}</section>`).join('');
  }
  return '';
}

function reportHtml(report: ClientReport): string {
  const period = report.period_start || report.period_end
    ? `<p><strong>Reporting period:</strong> ${escapeHtml(report.period_start || 'Start')} – ${escapeHtml(report.period_end || 'Present')}</p>`
    : '';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#18181b;line-height:1.5;max-width:760px;margin:0 auto;padding:24px">
    <h1>${escapeHtml(report.title)}</h1>
    <p><strong>Client:</strong> ${escapeHtml(report.client_name || report.client_organization_id)}</p>
    ${period}
    ${report.summary ? `<h2>Summary</h2><p>${escapeHtml(report.summary)}</p>` : ''}
    ${report.ai_summary ? `<h2>AI summary</h2><p>${escapeHtml(report.ai_summary)}</p>` : ''}
    <h2>Report details</h2>${renderContent(report.content)}
  </body></html>`;
}

async function assertClientAssigned(agencyId: string, clientOrganizationId: string): Promise<void> {
  const result = await query(
    `SELECT 1 FROM agency_client_assignments
     WHERE agency_id=$1 AND client_organization_id=$2 AND status='active'`,
    [agencyId, clientOrganizationId]
  );
  if (result.rows.length === 0) throw new AppError(403, 'Client organization is not actively assigned to this agency', 'CLIENT_NOT_ASSIGNED');
}

export async function listReports(agencyId: string, clientOrgId?: string): Promise<ClientReport[]> {
  let sql = `SELECT cr.*,o.name AS client_name FROM client_reports cr
             JOIN organizations o ON o.id=cr.client_organization_id WHERE cr.agency_id=$1`;
  const params: unknown[] = [agencyId];
  if (clientOrgId) { sql += ' AND cr.client_organization_id=$2'; params.push(clientOrgId); }
  sql += ' ORDER BY cr.created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapReportRow);
}

export async function getReport(reportId: string, agencyId: string): Promise<ClientReport> {
  const result = await query(
    `SELECT cr.*,o.name AS client_name FROM client_reports cr
     JOIN organizations o ON o.id=cr.client_organization_id WHERE cr.id=$1 AND cr.agency_id=$2`,
    [reportId, agencyId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Report');
  return mapReportRow(result.rows[0]);
}

export async function createReport(agencyId: string, userId: string, data: CreateReportData): Promise<ClientReport> {
  await assertClientAssigned(agencyId, data.client_organization_id);
  const result = await query(
    `INSERT INTO client_reports
       (agency_id,client_organization_id,title,report_type,period_start,period_end,content,summary,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [agencyId, data.client_organization_id, data.title, data.report_type, data.period_start || null, data.period_end || null, JSON.stringify(data.content || {}), data.summary || null, userId]
  );
  logger.info(`Report created: ${data.title} for agency ${agencyId}`);
  return mapReportRow(result.rows[0]);
}

export async function updateReport(reportId: string, agencyId: string, data: Partial<CreateReportData>): Promise<ClientReport> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let parameter = 1;
  const add = (column: string, value: unknown) => { updates.push(`${column}=$${parameter++}`); values.push(value); };
  if (data.title !== undefined) add('title', data.title);
  if (data.report_type !== undefined) add('report_type', data.report_type);
  if (data.period_start !== undefined) add('period_start', data.period_start || null);
  if (data.period_end !== undefined) add('period_end', data.period_end || null);
  if (data.content !== undefined) add('content', JSON.stringify(data.content));
  if (data.summary !== undefined) add('summary', data.summary || null);
  if (updates.length === 0) return getReport(reportId, agencyId);
  updates.push('updated_at=NOW()');
  values.push(reportId, agencyId);
  const result = await query(`UPDATE client_reports SET ${updates.join(',')} WHERE id=$${parameter} AND agency_id=$${parameter + 1} RETURNING *`, values);
  if (result.rows.length === 0) throw new NotFoundError('Report');
  return mapReportRow(result.rows[0]);
}

export async function publishReport(reportId: string, agencyId: string): Promise<ClientReport> {
  const result = await query("UPDATE client_reports SET status='published',updated_at=NOW() WHERE id=$1 AND agency_id=$2 RETURNING *", [reportId, agencyId]);
  if (result.rows.length === 0) throw new NotFoundError('Report');
  return mapReportRow(result.rows[0]);
}

export async function sendReport(reportId: string, agencyId: string, recipients: string[]): Promise<ClientReport> {
  const uniqueRecipients = [...new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  if (uniqueRecipients.length === 0) throw new AppError(400, 'At least one recipient is required', 'REPORT_RECIPIENT_REQUIRED');
  const report = await getReport(reportId, agencyId);
  const agencyResult = await query('SELECT organization_id,name FROM agencies WHERE id=$1', [agencyId]);
  if (agencyResult.rows.length === 0) throw new NotFoundError('Agency');
  const organizationId = String(agencyResult.rows[0].organization_id);
  const html = reportHtml(report);
  const deliveries = [];
  for (const recipient of uniqueRecipients) {
    deliveries.push({ recipient, ...(await deliverEmail(organizationId, recipient, report.title, html)) });
  }
  const result = await query(
    `UPDATE client_reports
     SET status='sent',sent_at=NOW(),updated_at=NOW(),
         content=jsonb_set(COALESCE(content,'{}'::jsonb),'{delivery}',$1::jsonb,TRUE)
     WHERE id=$2 AND agency_id=$3 RETURNING *`,
    [JSON.stringify({ delivered_at: new Date().toISOString(), recipients: uniqueRecipients, deliveries }), reportId, agencyId]
  );
  logger.info(`Report ${reportId} delivered to ${uniqueRecipients.length} recipient(s)`);
  return mapReportRow(result.rows[0]);
}

export async function deleteReport(reportId: string, agencyId: string): Promise<void> {
  const result = await query('DELETE FROM client_reports WHERE id=$1 AND agency_id=$2', [reportId, agencyId]);
  if (result.rowCount === 0) throw new NotFoundError('Report');
}

export async function getReportStats(agencyId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT COUNT(*) AS total_reports,
       COUNT(*) FILTER (WHERE status='draft') AS draft_reports,
       COUNT(*) FILTER (WHERE status='published') AS published_reports,
       COUNT(*) FILTER (WHERE status='sent') AS sent_reports,
       COUNT(DISTINCT client_organization_id) AS clients_with_reports
     FROM client_reports WHERE agency_id=$1`,
    [agencyId]
  );
  return result.rows[0];
}

function mapReportRow(row: Record<string, unknown>): ClientReport {
  return {
    id: String(row.id), agency_id: String(row.agency_id), client_organization_id: String(row.client_organization_id),
    client_name: row.client_name ? String(row.client_name) : undefined, title: String(row.title), report_type: String(row.report_type),
    period_start: row.period_start ? String(row.period_start) : null, period_end: row.period_end ? String(row.period_end) : null,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : (row.content as Record<string, unknown>) || {},
    summary: row.summary ? String(row.summary) : null, ai_summary: row.ai_summary ? String(row.ai_summary) : null,
    status: String(row.status), sent_at: row.sent_at ? String(row.sent_at) : null,
    created_by: row.created_by ? String(row.created_by) : null, created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}
