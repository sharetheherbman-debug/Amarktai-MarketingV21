import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { CalendarEvent, CreateCalendarEventData } from '../types';

export async function list(
  orgId: string,
  filters?: { month?: number; year?: number; campaign_id?: string; platform?: string }
): Promise<CalendarEvent[]> {
  let sql = 'SELECT * FROM content_calendar WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  let idx = 2;

  if (filters?.month && filters?.year) {
    sql += ` AND EXTRACT(MONTH FROM scheduled_date) = $${idx++} AND EXTRACT(YEAR FROM scheduled_date) = $${idx++}`;
    params.push(filters.month, filters.year);
  }
  if (filters?.campaign_id) {
    sql += ` AND campaign_id = $${idx++}`;
    params.push(filters.campaign_id);
  }
  if (filters?.platform) {
    sql += ` AND platform = $${idx++}`;
    params.push(filters.platform);
  }

  sql += ' ORDER BY scheduled_date ASC, scheduled_time ASC';
  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function getById(id: string, orgId: string): Promise<CalendarEvent> {
  const result = await query(
    'SELECT * FROM content_calendar WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Calendar event');
  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateCalendarEventData, userId: string): Promise<CalendarEvent> {
  const result = await query(
    `INSERT INTO content_calendar (organization_id, content_id, campaign_id, title, description, platform, content_type, scheduled_date, scheduled_time, publish_config, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      orgId,
      data.content_id || null,
      data.campaign_id || null,
      data.title,
      data.description || null,
      data.platform || null,
      data.content_type || null,
      data.scheduled_date,
      data.scheduled_time || null,
      JSON.stringify(data.publish_config || {}),
      userId,
    ]
  );
  logger.info(`Calendar event created: ${data.title} on ${data.scheduled_date}`);
  return mapRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: Partial<CreateCalendarEventData>): Promise<CalendarEvent> {
  const existing = await getById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { updates.push(`title = $${idx++}`); values.push(data.title); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.platform !== undefined) { updates.push(`platform = $${idx++}`); values.push(data.platform); }
  if (data.content_type !== undefined) { updates.push(`content_type = $${idx++}`); values.push(data.content_type); }
  if (data.scheduled_date !== undefined) { updates.push(`scheduled_date = $${idx++}`); values.push(data.scheduled_date); }
  if (data.scheduled_time !== undefined) { updates.push(`scheduled_time = $${idx++}`); values.push(data.scheduled_time); }
  if (data.content_id !== undefined) { updates.push(`content_id = $${idx++}`); values.push(data.content_id); }

  if (updates.length === 0) return existing;

  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE content_calendar SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
    values
  );
  return mapRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM content_calendar WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Calendar event');
}

export async function getUpcoming(orgId: string, days: number = 30): Promise<CalendarEvent[]> {
  const result = await query(
    `SELECT * FROM content_calendar
     WHERE organization_id = $1
       AND scheduled_date >= CURRENT_DATE
       AND scheduled_date <= CURRENT_DATE + INTERVAL '${days} days'
     ORDER BY scheduled_date ASC, scheduled_time ASC`,
    [orgId]
  );
  return result.rows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    content_id: row.content_id as string | null,
    campaign_id: row.campaign_id as string | null,
    title: row.title as string,
    description: row.description as string | null,
    platform: row.platform as CalendarEvent['platform'],
    content_type: row.content_type as CalendarEvent['content_type'],
    scheduled_date: row.scheduled_date as string,
    scheduled_time: row.scheduled_time as string | null,
    status: row.status as string,
    publish_config: typeof row.publish_config === 'string' ? JSON.parse(row.publish_config) : (row.publish_config as Record<string, unknown>) || {},
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
