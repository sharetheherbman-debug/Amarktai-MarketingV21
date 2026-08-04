import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { BrandDna, CreateBrandDnaData, UpdateBrandDnaData } from '../types';

export async function get(orgId: string): Promise<BrandDna | null> {
  const result = await query(
    'SELECT * FROM brand_dna WHERE organization_id = $1',
    [orgId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateBrandDnaData): Promise<BrandDna> {
  const result = await query(
    `INSERT INTO brand_dna (organization_id, company_name, industry, brand_voice, target_audience, goals, keywords, writing_style, prohibited_phrases, preferred_ctas, colors, fonts, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      orgId,
      data.company_name,
      data.industry || null,
      data.brand_voice || null,
      JSON.stringify(data.target_audience || {}),
      JSON.stringify(data.goals || []),
      JSON.stringify(data.keywords || []),
      data.writing_style || null,
      JSON.stringify(data.prohibited_phrases || []),
      JSON.stringify(data.preferred_ctas || []),
      JSON.stringify(data.colors || {}),
      JSON.stringify(data.fonts || {}),
      JSON.stringify(data.metadata || {}),
    ]
  );

  logger.info(`Brand DNA created for org: ${orgId}`);
  return mapRow(result.rows[0]);
}

export async function update(orgId: string, data: UpdateBrandDnaData): Promise<BrandDna> {
  const existing = await get(orgId);
  if (!existing) {
    throw new NotFoundError('Brand DNA');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.company_name !== undefined) {
    updates.push(`company_name = $${paramCount++}`);
    values.push(data.company_name);
  }
  if (data.industry !== undefined) {
    updates.push(`industry = $${paramCount++}`);
    values.push(data.industry);
  }
  if (data.brand_voice !== undefined) {
    updates.push(`brand_voice = $${paramCount++}`);
    values.push(data.brand_voice);
  }
  if (data.target_audience !== undefined) {
    updates.push(`target_audience = $${paramCount++}`);
    values.push(JSON.stringify(data.target_audience));
  }
  if (data.goals !== undefined) {
    updates.push(`goals = $${paramCount++}`);
    values.push(JSON.stringify(data.goals));
  }
  if (data.keywords !== undefined) {
    updates.push(`keywords = $${paramCount++}`);
    values.push(JSON.stringify(data.keywords));
  }
  if (data.writing_style !== undefined) {
    updates.push(`writing_style = $${paramCount++}`);
    values.push(data.writing_style);
  }
  if (data.prohibited_phrases !== undefined) {
    updates.push(`prohibited_phrases = $${paramCount++}`);
    values.push(JSON.stringify(data.prohibited_phrases));
  }
  if (data.preferred_ctas !== undefined) {
    updates.push(`preferred_ctas = $${paramCount++}`);
    values.push(JSON.stringify(data.preferred_ctas));
  }
  if (data.colors !== undefined) {
    updates.push(`colors = $${paramCount++}`);
    values.push(JSON.stringify(data.colors));
  }
  if (data.fonts !== undefined) {
    updates.push(`fonts = $${paramCount++}`);
    values.push(JSON.stringify(data.fonts));
  }
  if (data.metadata !== undefined) {
    updates.push(`metadata = $${paramCount++}`);
    values.push(JSON.stringify(data.metadata));
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = NOW()');
  values.push(orgId);

  const result = await query(
    `UPDATE brand_dna SET ${updates.join(', ')} WHERE organization_id = $${paramCount} RETURNING *`,
    values
  );

  logger.info(`Brand DNA updated for org: ${orgId}`);
  return mapRow(result.rows[0]);
}

export async function upsert(orgId: string, data: Partial<CreateBrandDnaData>): Promise<BrandDna> {
  const existing = await get(orgId);

  if (existing) {
    return update(orgId, data as UpdateBrandDnaData);
  } else {
    if (!data.company_name) {
      data.company_name = 'My Company';
    }
    return create(orgId, data as CreateBrandDnaData);
  }
}

export async function remove(orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM brand_dna WHERE organization_id = $1 RETURNING organization_id',
    [orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Brand DNA');
  }

  logger.info(`Brand DNA deleted for org: ${orgId}`);
}

export async function getContextString(orgId: string): Promise<string> {
  const dna = await get(orgId);

  if (!dna) {
    return '';
  }

  const lines: string[] = ['BRAND DNA:'];

  if (dna.company_name) {
    lines.push(`Company: ${dna.company_name}`);
  }
  if (dna.industry) {
    lines.push(`Industry: ${dna.industry}`);
  }
  if (dna.brand_voice) {
    lines.push(`Brand Voice: ${dna.brand_voice}`);
  }
  if (dna.target_audience) {
    const audience = dna.target_audience as Record<string, unknown>;
    const parts: string[] = [];
    if (audience.description) parts.push(String(audience.description));
    if (audience.age_range) parts.push(String(audience.age_range));
    if (parts.length > 0) {
      lines.push(`Target Audience: ${parts.join(', ')}`);
    }
  }
  if (dna.goals && Array.isArray(dna.goals) && dna.goals.length > 0) {
    lines.push(`Goals: ${(dna.goals as string[]).join(', ')}`);
  }
  if (dna.keywords && Array.isArray(dna.keywords) && dna.keywords.length > 0) {
    lines.push(`Keywords: ${(dna.keywords as string[]).join(', ')}`);
  }
  if (dna.writing_style) {
    lines.push(`Writing Style: ${dna.writing_style}`);
  }
  if (dna.prohibited_phrases && Array.isArray(dna.prohibited_phrases) && dna.prohibited_phrases.length > 0) {
    lines.push(`Prohibited Phrases: ${(dna.prohibited_phrases as string[]).map((p) => `"${p}"`).join(', ')}`);
  }
  if (dna.preferred_ctas && Array.isArray(dna.preferred_ctas) && dna.preferred_ctas.length > 0) {
    lines.push(`Preferred CTAs: ${(dna.preferred_ctas as string[]).map((c) => `"${c}"`).join(', ')}`);
  }

  return lines.join('\n');
}

function mapRow(row: Record<string, unknown>): BrandDna {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    company_name: row.company_name as string,
    industry: row.industry as string | null,
    brand_voice: row.brand_voice as string | null,
    target_audience: typeof row.target_audience === 'string' ? JSON.parse(row.target_audience as string) : (row.target_audience as Record<string, unknown>) || {},
    goals: typeof row.goals === 'string' ? JSON.parse(row.goals as string) : (row.goals as string[]) || [],
    keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords as string) : (row.keywords as string[]) || [],
    writing_style: row.writing_style as string | null,
    prohibited_phrases: typeof row.prohibited_phrases === 'string' ? JSON.parse(row.prohibited_phrases as string) : (row.prohibited_phrases as string[]) || [],
    preferred_ctas: typeof row.preferred_ctas === 'string' ? JSON.parse(row.preferred_ctas as string) : (row.preferred_ctas as string[]) || [],
    colors: typeof row.colors === 'string' ? JSON.parse(row.colors as string) : (row.colors as Record<string, unknown>) || {},
    fonts: typeof row.fonts === 'string' ? JSON.parse(row.fonts as string) : (row.fonts as Record<string, unknown>) || {},
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}
