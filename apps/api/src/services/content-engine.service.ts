import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import {
  ContentItem,
  CreateContentData,
  UpdateContentData,
  ContentVersion,
  ContentType,
  ContentPlatform,
  ContentStatus,
  GenerateContentRequest,
  ContentGenerationJob,
  QualityReport,
} from '../types';
import * as brandDnaService from './brand-dna.service';
import * as promptService from './prompt.service';
import * as knowledgeService from './knowledge.service';
import * as memoryService from '../memory/memory.service';
import { providerRouter } from '../providers/provider-router';
import { contextEngine } from './context-engine.service';

// ─── Content CRUD ────────────────────────────────────────────────────────────

export async function list(
  orgId: string,
  filters?: { type?: string; status?: string; platform?: string; campaign_id?: string }
): Promise<ContentItem[]> {
  let sql = 'SELECT * FROM content_items WHERE organization_id = $1 AND deleted_at IS NULL';
  const params: unknown[] = [orgId];
  let paramIdx = 2;

  if (filters?.type) {
    sql += ` AND type = $${paramIdx++}`;
    params.push(filters.type);
  }
  if (filters?.status) {
    sql += ` AND status = $${paramIdx++}`;
    params.push(filters.status);
  }
  if (filters?.platform) {
    sql += ` AND platform = $${paramIdx++}`;
    params.push(filters.platform);
  }
  if (filters?.campaign_id) {
    sql += ` AND campaign_id = $${paramIdx++}`;
    params.push(filters.campaign_id);
  }

  sql += ' ORDER BY updated_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapContentRow);
}

export async function getById(id: string, orgId: string): Promise<ContentItem> {
  const result = await query(
    'SELECT * FROM content_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Content');
  return mapContentRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateContentData, userId: string): Promise<ContentItem> {
  const wordCount = data.body ? countWords(data.body) : 0;
  const readingTime = Math.ceil(wordCount / 200);

  const result = await query(
    `INSERT INTO content_items (organization_id, title, body, excerpt, type, format, platform, campaign_id, project_id, template_id, metadata, word_count, reading_time_seconds, created_by, assigned_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      orgId,
      data.title,
      data.body || null,
      data.excerpt || null,
      data.type,
      data.format || 'markdown',
      data.platform || null,
      data.campaign_id || null,
      data.project_id || null,
      data.template_id || null,
      JSON.stringify(data.metadata || {}),
      wordCount,
      readingTime,
      userId,
      data.assigned_to || null,
    ]
  );

  const content = mapContentRow(result.rows[0]);
  await saveVersion(orgId, content, userId);
  logger.info(`Content created: ${content.id} (${content.type}) for org: ${orgId}`);
  return content;
}

export async function update(id: string, orgId: string, data: UpdateContentData, userId: string): Promise<ContentItem> {
  const existing = await getById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.title !== undefined) { updates.push(`title = $${paramIdx++}`); values.push(data.title); }
  if (data.body !== undefined) {
    updates.push(`body = $${paramIdx++}`); values.push(data.body);
    updates.push(`word_count = $${paramIdx++}`); values.push(countWords(data.body));
    updates.push(`reading_time_seconds = $${paramIdx++}`); values.push(Math.ceil(countWords(data.body) / 200));
  }
  if (data.excerpt !== undefined) { updates.push(`excerpt = $${paramIdx++}`); values.push(data.excerpt); }
  if (data.type !== undefined) { updates.push(`type = $${paramIdx++}`); values.push(data.type); }
  if (data.format !== undefined) { updates.push(`format = $${paramIdx++}`); values.push(data.format); }
  if (data.platform !== undefined) { updates.push(`platform = $${paramIdx++}`); values.push(data.platform); }
  if (data.status !== undefined) {
    updates.push(`status = $${paramIdx++}`); values.push(data.status);
    if (data.status === 'published') { updates.push(`published_at = NOW()`); }
    if (data.status === 'archived') { updates.push(`archived_at = NOW()`); }
  }
  if (data.metadata !== undefined) { updates.push(`metadata = $${paramIdx++}`); values.push(JSON.stringify(data.metadata)); }
  if (data.scheduled_at !== undefined) { updates.push(`scheduled_at = $${paramIdx++}`); values.push(data.scheduled_at); }
  if (data.assigned_to !== undefined) { updates.push(`assigned_to = $${paramIdx++}`); values.push(data.assigned_to); }

  if (updates.length === 0) return existing;

  updates.push(`version = version + 1`);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE content_items SET ${updates.join(', ')} WHERE id = $${paramIdx} AND organization_id = $${paramIdx + 1} AND deleted_at IS NULL RETURNING *`,
    values
  );

  const content = mapContentRow(result.rows[0]);
  await saveVersion(orgId, content, userId);
  logger.info(`Content updated: ${id}`);
  return content;
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'UPDATE content_items SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Content');
  logger.info(`Content deleted: ${id}`);
}

// ─── Version History ─────────────────────────────────────────────────────────

export async function getVersions(contentId: string, orgId: string): Promise<ContentVersion[]> {
  const result = await query(
    'SELECT * FROM content_versions WHERE content_id = $1 AND organization_id = $2 ORDER BY version DESC',
    [contentId, orgId]
  );
  return result.rows.map(mapVersionRow);
}

async function saveVersion(orgId: string, content: ContentItem, userId: string): Promise<void> {
  await query(
    `INSERT INTO content_versions (content_id, organization_id, version, title, body, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [content.id, orgId, content.version, content.title, content.body, JSON.stringify(content.metadata), userId]
  );
}

// ─── Content Generation Pipeline ─────────────────────────────────────────────

export async function generateContent(
  orgId: string,
  request: GenerateContentRequest,
  userId: string
): Promise<{ content: ContentItem; job: ContentGenerationJob }> {
  const startTime = Date.now();

  // 1. Create generation job
  const job = await createGenerationJob(orgId, request, userId);

  try {
    // 2. Update job status to planning
    await updateJobStatus(job.id, 'planning');

    // 3. Build context using Context Engine
    const context = await contextEngine.assemble({
      orgId: orgId,
      agentId: '', // No specific agent for content generation
      includeBrandDna: true,
      includeKnowledge: true,
      includeHistory: false,
    });

    // 4. Select and render prompt
    let prompt = request.prompt;
    let systemPrompt = '';

    if (request.template_id) {
      const templateResult = await query(
        'SELECT * FROM content_templates WHERE id = $1 AND organization_id = $2',
        [request.template_id, orgId]
      );
      if (templateResult.rows.length > 0) {
        const template = templateResult.rows[0];
        prompt = renderTemplate(template.prompt_template || request.prompt, request.variables || {});
        systemPrompt = template.system_prompt || '';
      }
    }

    // 5. Build full prompt with context
    const fullPrompt = buildGenerationPrompt(prompt, context, request);

    // 6. Update job status to generating
    await updateJobStatus(job.id, 'generating');

    // 7. Generate content via Provider Router
    const aiResponse = await providerRouter.routeRequest(
      [{ role: 'user', content: fullPrompt }],
      'gpt-4o',
      { max_tokens: getMaxTokens(request.type), temperature: 0.7 },
      { organizationId: orgId }
    );

    const generatedText = aiResponse.content;

    // 8. Create content item
    const content = await create(orgId, {
      title: request.title || generateTitle(request.type, request.platform),
      body: generatedText,
      type: request.type,
      platform: request.platform,
      campaign_id: request.campaign_id,
      template_id: request.template_id,
      metadata: {
        generation_request: request,
        context_used: {
          brand_dna: !!context.brandDna,
          knowledge: !!context.knowledge,
        },
      },
    }, userId);

    // 9. Mark as AI generated
    await query(
      `UPDATE content_items SET ai_generated = TRUE, ai_model = $1, ai_prompt = $2, ai_context = $3 WHERE id = $4`,
      ['gpt-4o', prompt, JSON.stringify({ brandDna: context.brandDna?.substring(0, 200), knowledge: context.knowledge?.substring(0, 200) }), content.id]
    );

    // 10. Update job as completed
    const latency = Date.now() - startTime;
    await query(
      `UPDATE content_generation_jobs SET status = 'completed', content_id = $1, output = $2, latency_ms = $3, completed_at = NOW() WHERE id = $4`,
      [content.id, JSON.stringify({ text: generatedText }), latency, job.id]
    );

    logger.info(`Content generated: ${content.id} in ${latency}ms`);
    return { content, job: { ...job, status: 'completed', content_id: content.id } };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    await query(
      `UPDATE content_generation_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [message, job.id]
    );
    throw new AppError(500, `Content generation failed: ${message}`, 'GENERATION_ERROR');
  }
}

async function createGenerationJob(orgId: string, request: GenerateContentRequest, userId: string): Promise<ContentGenerationJob> {
  const result = await query(
    `INSERT INTO content_generation_jobs (organization_id, type, platform, input, template_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, request.type, request.platform || null, JSON.stringify(request), request.template_id || null, userId]
  );
  return mapJobRow(result.rows[0]);
}

async function updateJobStatus(jobId: string, status: string): Promise<void> {
  await query('UPDATE content_generation_jobs SET status = $1, updated_at = NOW() WHERE id = $2', [status, jobId]);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function buildGenerationPrompt(
  prompt: string,
  context: { brandDna: string; knowledge: string; fullContext: string },
  request: GenerateContentRequest
): string {
  const parts: string[] = [];

  if (context.brandDna) {
    parts.push(`BRAND VOICE:\n${context.brandDna}`);
  }

  if (context.knowledge) {
    parts.push(`\nRELEVANT KNOWLEDGE:\n${context.knowledge.substring(0, 1000)}`);
  }

  parts.push(`\nTASK: ${prompt}`);

  if (request.max_words) parts.push(`\nMax words: ${request.max_words}`);
  if (request.tone) parts.push(`Tone: ${request.tone}`);
  if (request.platform) parts.push(`Platform: ${request.platform}`);

  return parts.join('\n\n');
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return rendered;
}

function generateTitle(type: ContentType, platform?: ContentPlatform): string {
  const typeLabels: Record<string, string> = {
    blog: 'Blog Post',
    article: 'Article',
    landing_page: 'Landing Page',
    sales_page: 'Sales Page',
    product_desc: 'Product Description',
    service_page: 'Service Page',
    case_study: 'Case Study',
    faq: 'FAQ',
    newsletter: 'Newsletter',
    email: 'Email',
    press_release: 'Press Release',
    social: 'Social Post',
    asset: 'Marketing Asset',
  };
  const label = typeLabels[type] || 'Content';
  return platform ? `${label} for ${platform}` : `${label} - ${new Date().toISOString().split('T')[0]}`;
}

function getMaxTokens(type: ContentType): number {
  const limits: Record<string, number> = {
    blog: 4000, article: 6000, landing_page: 3000, sales_page: 4000,
    product_desc: 500, service_page: 2000, case_study: 4000, faq: 2000,
    newsletter: 2000, email: 1000, press_release: 2000, social: 500, asset: 200,
    ad: 500, video: 1000, image: 200,
  };
  return limits[type] || 2000;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function mapContentRow(row: Record<string, unknown>): ContentItem {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    campaign_id: row.campaign_id as string | null,
    project_id: row.project_id as string | null,
    title: row.title as string,
    body: row.body as string | null,
    excerpt: row.excerpt as string | null,
    type: row.type as ContentType,
    format: row.format as string,
    platform: row.platform as ContentPlatform | null,
    status: row.status as ContentStatus,
    workflow_state: row.workflow_state as string,
    language: row.language as string,
    word_count: parseInt(row.word_count as string) || 0,
    reading_time_seconds: parseInt(row.reading_time_seconds as string) || 0,
    seo_score: parseFloat(row.seo_score as string) || 0,
    readability_score: parseFloat(row.readability_score as string) || 0,
    brand_voice_score: parseFloat(row.brand_voice_score as string) || 0,
    quality_score: parseFloat(row.quality_score as string) || 0,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    ai_generated: row.ai_generated as boolean,
    ai_model: row.ai_model as string | null,
    ai_prompt: row.ai_prompt as string | null,
    ai_context: typeof row.ai_context === 'string' ? JSON.parse(row.ai_context) : (row.ai_context as Record<string, unknown>) || {},
    template_id: row.template_id as string | null,
    parent_id: row.parent_id as string | null,
    version: parseInt(row.version as string) || 1,
    scheduled_at: row.scheduled_at as string | null,
    published_at: row.published_at as string | null,
    archived_at: row.archived_at as string | null,
    created_by: row.created_by as string | null,
    assigned_to: row.assigned_to as string | null,
    approved_by: row.approved_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapVersionRow(row: Record<string, unknown>): ContentVersion {
  return {
    id: row.id as string,
    content_id: row.content_id as string,
    organization_id: row.organization_id as string,
    version: parseInt(row.version as string),
    title: row.title as string,
    body: row.body as string | null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    change_summary: row.change_summary as string | null,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
  };
}

function mapJobRow(row: Record<string, unknown>): ContentGenerationJob {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    content_id: row.content_id as string | null,
    template_id: row.template_id as string | null,
    type: row.type as ContentType,
    platform: row.platform as ContentPlatform | null,
    status: row.status as ContentGenerationJob['status'],
    input: typeof row.input === 'string' ? JSON.parse(row.input) : (row.input as Record<string, unknown>) || {},
    output: typeof row.output === 'string' ? JSON.parse(row.output) : (row.output as Record<string, unknown>) || {},
    quality_results: typeof row.quality_results === 'string' ? JSON.parse(row.quality_results) : (row.quality_results as Record<string, unknown>) || {},
    error: row.error as string | null,
    tokens_in: parseInt(row.tokens_in as string) || 0,
    tokens_out: parseInt(row.tokens_out as string) || 0,
    cost_cents: parseInt(row.cost_cents as string) || 0,
    latency_ms: parseInt(row.latency_ms as string) || 0,
    provider_used: row.provider_used as string | null,
    model_used: row.model_used as string | null,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
