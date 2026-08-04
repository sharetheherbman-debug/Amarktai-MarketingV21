import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { ContentTemplate, CreateTemplateData, TemplateVariable } from '../types';

export async function list(orgId: string, category?: string): Promise<ContentTemplate[]> {
  let sql = 'SELECT * FROM content_templates WHERE organization_id = $1 AND deleted_at IS NULL AND is_active = TRUE';
  const params: unknown[] = [orgId];

  if (category) {
    sql += ' AND category = $2';
    params.push(category);
  }

  sql += ' ORDER BY usage_count DESC, name ASC';
  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function getById(id: string, orgId: string): Promise<ContentTemplate> {
  const result = await query(
    'SELECT * FROM content_templates WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Template');
  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateTemplateData, userId: string): Promise<ContentTemplate> {
  const result = await query(
    `INSERT INTO content_templates (organization_id, name, description, category, type, platform, template_body, variables, prompt_template, system_prompt, brand_voice_override, default_metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [
      orgId,
      data.name,
      data.description || null,
      data.category,
      data.type,
      data.platform || null,
      data.template_body,
      JSON.stringify(data.variables || []),
      data.prompt_template || null,
      data.system_prompt || null,
      JSON.stringify(data.brand_voice_override || {}),
      JSON.stringify(data.default_metadata || {}),
      userId,
    ]
  );
  logger.info(`Template created: ${data.name} for org: ${orgId}`);
  return mapRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: Partial<CreateTemplateData>): Promise<ContentTemplate> {
  const existing = await getById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.category !== undefined) { updates.push(`category = $${idx++}`); values.push(data.category); }
  if (data.type !== undefined) { updates.push(`type = $${idx++}`); values.push(data.type); }
  if (data.platform !== undefined) { updates.push(`platform = $${idx++}`); values.push(data.platform); }
  if (data.template_body !== undefined) { updates.push(`template_body = $${idx++}`); values.push(data.template_body); }
  if (data.variables !== undefined) { updates.push(`variables = $${idx++}`); values.push(JSON.stringify(data.variables)); }
  if (data.prompt_template !== undefined) { updates.push(`prompt_template = $${idx++}`); values.push(data.prompt_template); }
  if (data.system_prompt !== undefined) { updates.push(`system_prompt = $${idx++}`); values.push(data.system_prompt); }

  if (updates.length === 0) return existing;

  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE content_templates SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
    values
  );
  return mapRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'UPDATE content_templates SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Template');
}

export async function incrementUsage(id: string): Promise<void> {
  await query('UPDATE content_templates SET usage_count = usage_count + 1 WHERE id = $1', [id]);
}

// ─── Built-in Templates ──────────────────────────────────────────────────────

export async function seedDefaultTemplates(orgId: string): Promise<void> {
  const templates = [
    {
      name: 'Blog Post',
      description: 'Standard blog post template',
      category: 'blog',
      type: 'blog',
      template_body: '# {{title}}\n\n{{introduction}}\n\n## Key Points\n\n{{key_points}}\n\n## Conclusion\n\n{{conclusion}}',
      variables: [
        { name: 'title', type: 'string', description: 'Blog post title', required: true },
        { name: 'introduction', type: 'text', description: 'Introduction paragraph', required: true },
        { name: 'key_points', type: 'text', description: 'Main content sections', required: true },
        { name: 'conclusion', type: 'text', description: 'Conclusion paragraph', required: true },
      ],
      prompt_template: 'Write a blog post about {{topic}} for {{audience}}. Tone: {{tone}}. Include these key points: {{key_points}}.',
    },
    {
      name: 'Social Media Post',
      description: 'Platform-specific social post',
      category: 'social',
      type: 'social',
      template_body: '{{content}}\n\n{{hashtags}}',
      variables: [
        { name: 'content', type: 'text', description: 'Post content', required: true },
        { name: 'hashtags', type: 'string', description: 'Hashtags', required: false },
      ],
      prompt_template: 'Create a {{platform}} post about {{topic}}. Keep it under {{max_length}} characters. Tone: {{tone}}.',
    },
    {
      name: 'Email Campaign',
      description: 'Marketing email template',
      category: 'email',
      type: 'email',
      template_body: 'Subject: {{subject}}\n\n{{body}}\n\n{{cta}}',
      variables: [
        { name: 'subject', type: 'string', description: 'Email subject line', required: true },
        { name: 'body', type: 'text', description: 'Email body', required: true },
        { name: 'cta', type: 'string', description: 'Call to action', required: true },
      ],
      prompt_template: 'Write a marketing email about {{topic}}. Subject line should be compelling. Include a clear CTA: {{cta}}.',
    },
    {
      name: 'Product Description',
      description: 'E-commerce product description',
      category: 'asset',
      type: 'product_desc',
      template_body: '## {{product_name}}\n\n{{description}}\n\n**Key Features:**\n{{features}}\n\n**Price:** {{price}}',
      variables: [
        { name: 'product_name', type: 'string', description: 'Product name', required: true },
        { name: 'description', type: 'text', description: 'Product description', required: true },
        { name: 'features', type: 'text', description: 'Key features list', required: true },
        { name: 'price', type: 'string', description: 'Price', required: false },
      ],
      prompt_template: 'Write a compelling product description for {{product_name}}. Highlight these features: {{features}}. Target audience: {{audience}}.',
    },
    {
      name: 'Landing Page',
      description: 'Conversion-focused landing page',
      category: 'landing_page',
      type: 'landing_page',
      template_body: '# {{headline}}\n\n{{subheadline}}\n\n## Benefits\n\n{{benefits}}\n\n## Social Proof\n\n{{social_proof}}\n\n## CTA\n\n{{cta}}',
      variables: [
        { name: 'headline', type: 'string', description: 'Main headline', required: true },
        { name: 'subheadline', type: 'string', description: 'Supporting headline', required: true },
        { name: 'benefits', type: 'text', description: 'Key benefits', required: true },
        { name: 'social_proof', type: 'text', description: 'Testimonials or stats', required: false },
        { name: 'cta', type: 'string', description: 'Call to action', required: true },
      ],
      prompt_template: 'Create a landing page for {{product}}. Focus on benefits: {{benefits}}. Target audience: {{audience}}. Main CTA: {{cta}}.',
    },
  ];

  for (const t of templates) {
    await query(
      `INSERT INTO content_templates (organization_id, name, description, category, type, template_body, variables, prompt_template, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       ON CONFLICT DO NOTHING`,
      [orgId, t.name, t.description, t.category, t.type, t.template_body, JSON.stringify(t.variables), t.prompt_template]
    );
  }
}

function mapRow(row: Record<string, unknown>): ContentTemplate {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    description: row.description as string | null,
    category: row.category as string,
    type: row.type as ContentTemplate['type'],
    platform: row.platform as ContentTemplate['platform'],
    template_body: row.template_body as string,
    variables: typeof row.variables === 'string' ? JSON.parse(row.variables) : (row.variables as TemplateVariable[]) || [],
    conditional_sections: typeof row.conditional_sections === 'string' ? JSON.parse(row.conditional_sections) : (row.conditional_sections as ContentTemplate['conditional_sections']) || [],
    prompt_template: row.prompt_template as string | null,
    system_prompt: row.system_prompt as string | null,
    brand_voice_override: typeof row.brand_voice_override === 'string' ? JSON.parse(row.brand_voice_override) : (row.brand_voice_override as Record<string, unknown>) || {},
    default_metadata: typeof row.default_metadata === 'string' ? JSON.parse(row.default_metadata) : (row.default_metadata as Record<string, unknown>) || {},
    is_system: row.is_system as boolean,
    usage_count: parseInt(row.usage_count as string) || 0,
    version: parseInt(row.version as string) || 1,
    is_active: row.is_active as boolean,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
