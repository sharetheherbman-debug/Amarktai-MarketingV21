import { query } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface ClientReport {
  id: string;
  agency_id: string;
  client_organization_id: string;
  client_name?: string;
  title: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  content: Record<string, unknown>;
  summary: string | null;
  ai_summary: string | null;
  status: string;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReportData {
  client_organization_id: string;
  title: string;
  report_type: string;
  period_start?: string;
  period_end?: string;
  content?: Record<string, unknown>;
  summary?: string;
}

export async function listReports(agencyId: string, clientOrgId?: string): Promise<ClientReport[]> {
  let sql = `SELECT cr.*, o.name as client_name
             FROM client_reports cr
             JOIN organizations o ON cr.client_organization_id = o.id
             WHERE cr.agency_id = $1`;
  const params: unknown[] = [agencyId];

  if (clientOrgId) {
    sql += ' AND cr.client_organization_id = $2';
    params.push(clientOrgId);
  }

  sql += ' ORDER BY cr.created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapReportRow);
}

export async function getReport(reportId: string, agencyId: string): Promise<ClientReport> {
  const result = await query(
    `SELECT cr.*, o.name as client_name
     FROM client_reports cr
     JOIN organizations o ON cr.client_organization_id = o.id
     WHERE cr.id = $1 AND cr.agency_id = $2`,
    [reportId, agencyId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Report');
  return mapReportRow(result.rows[0]);
}

export async function createReport(agencyId: string, userId: string, data: CreateReportData): Promise<ClientReport> {
  const result = await query(
    `INSERT INTO client_reports (agency_id, client_organization_id, title, report_type, period_start, period_end, content, summary, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      agencyId, data.client_organization_id, data.title, data.report_type,
      data.period_start || null, data.period_end || null,
      JSON.stringify(data.content || {}), data.summary || null, userId
    ]
  );
  logger.info(`Report created: ${data.title} for agency ${agencyId}`);
  return mapReportRow(result.rows[0]);
}

export async function updateReport(reportId: string, agencyId: string, data: Partial<CreateReportData>): Promise<ClientReport> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.title !== undefined) { updates.push(`title = $${paramCount++}`); values.push(data.title); }
  if (data.report_type !== undefined) { updates.push(`report_type = $${paramCount++}`); values.push(data.report_type); }
  if (data.period_start !== undefined) { updates.push(`period_start = $${paramCount++}`); values.push(data.period_start); }
  if (data.period_end !== undefined) { updates.push(`period_end = $${paramCount++}`); values.push(data.period_end); }
  if (data.content !== undefined) { updates.push(`content = $${paramCount++}`); values.push(JSON.stringify(data.content)); }
  if (data.summary !== undefined) { updates.push(`summary = $${paramCount++}`); values.push(data.summary); }

  if (updates.length === 0) return getReport(reportId, agencyId);

  updates.push(`updated_at = NOW()`);
  values.push(reportId, agencyId);

  const result = await query(
    `UPDATE client_reports SET ${updates.join(', ')} WHERE id = $${paramCount} AND agency_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Report');
  logger.info(`Report updated: ${reportId}`);
  return mapReportRow(result.rows[0]);
}

export async function publishReport(reportId: string, agencyId: string): Promise<ClientReport> {
  const result = await query(
    `UPDATE client_reports SET status = 'published', updated_at = NOW()
     WHERE id = $1 AND agency_id = $2 RETURNING *`,
    [reportId, agencyId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Report');
  logger.info(`Report published: ${reportId}`);
  return mapReportRow(result.rows[0]);
}

export async function sendReport(reportId: string, agencyId: string): Promise<ClientReport> {
  const result = await query(
    `UPDATE client_reports SET status = 'sent', sent_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND agency_id = $2 RETURNING *`,
    [reportId, agencyId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Report');
  logger.info(`Report sent: ${reportId}`);
  return mapReportRow(result.rows[0]);
}

export async function deleteReport(reportId: string, agencyId: string): Promise<void> {
  const result = await query(
    'DELETE FROM client_reports WHERE id = $1 AND agency_id = $2',
    [reportId, agencyId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Report');
  logger.info(`Report deleted: ${reportId}`);
}

export async function getReportStats(agencyId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT
       COUNT(*) as total_reports,
       COUNT(*) FILTER (WHERE status = 'draft') as draft_reports,
       COUNT(*) FILTER (WHERE status = 'published') as published_reports,
       COUNT(*) FILTER (WHERE status = 'sent') as sent_reports,
       COUNT(DISTINCT client_organization_id) as clients_with_reports
     FROM client_reports WHERE agency_id = $1`,
    [agencyId]
  );
  return result.rows[0];
}

function mapReportRow(row: Record<string, unknown>): ClientReport {
  return {
    id: row.id as string,
    agency_id: row.agency_id as string,
    client_organization_id: row.client_organization_id as string,
    client_name: row.client_name as string | undefined,
    title: row.title as string,
    report_type: row.report_type as string,
    period_start: row.period_start as string | null,
    period_end: row.period_end as string | null,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : (row.content as Record<string, unknown>) || {},
    summary: row.summary as string | null,
    ai_summary: row.ai_summary as string | null,
    status: row.status as string,
    sent_at: row.sent_at as string | null,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
