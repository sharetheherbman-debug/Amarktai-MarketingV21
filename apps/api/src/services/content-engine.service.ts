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
import { getItem as getLibraryItem, recordUsage as recordLibraryUsage } from './marketing-library.service';
import * as brandDnaService from './brand-dna.service';
import * as promptService from './prompt.service';
import * as knowledgeService from './knowledge.service';
import * as memoryService from '../memory/memory.service';
import { contextEngine } from './context-engine.service';
import * as contentQuality from './content-quality.service';
import { generateGovernedText } from './governed-text-generation.service';
import { env } from '../config/env';
import { normalizeProductScopes } from '../utils/product-scope';

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
    `INSERT INTO content_items (organization_id, title, body, excerpt, type, format, platform, campaign_id, project_id, template_id, metadata, word_count, reading_time_seconds, created_by, assigned_to, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
      data.parent_id || null,
    ]
  );

  const content = mapContentRow(result.rows[0]);
  await saveVersion(orgId, content, userId);
  logger.info(`Content created: ${content.id} (${content.type}) for org: ${orgId}`);
  return content;
}

export async function update(id: string, orgId: string, data: UpdateContentData, userId: string): Promise<ContentItem> {
  const existing = await getById(id, orgId);
  if (data.status && ['approved', 'published', 'scheduled'].includes(data.status)) {
    throw new AppError(
      409,
      'Approval, scheduling and publication must use the governed workflow',
      'CONTENT_WORKFLOW_REQUIRED'
    );
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;
  const materiallyEdited = [
    data.title, data.body, data.excerpt, data.type, data.format, data.platform, data.metadata,
  ].some((value) => value !== undefined);

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

  if (materiallyEdited) {
    updates.push("status = 'draft'", "workflow_state = 'draft'", 'approved_by = NULL', 'scheduled_at = NULL');
  }

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

export async function restoreVersion(
  contentId: string,
  orgId: string,
  version: number,
  userId: string
): Promise<ContentItem> {
  const source = await query(
    `SELECT title,body,metadata,version FROM content_versions
     WHERE content_id=$1 AND organization_id=$2 AND version=$3`,
    [contentId, orgId, version]
  );
  if (source.rows.length === 0) throw new NotFoundError('Content version');
  const restored = await update(contentId, orgId, {
    title: String(source.rows[0].title),
    body: source.rows[0].body ? String(source.rows[0].body) : '',
    metadata: {
      ...(typeof source.rows[0].metadata === 'string' ? JSON.parse(source.rows[0].metadata) : source.rows[0].metadata || {}),
      restored_from_version: version,
    },
    status: 'draft',
  }, userId);
  await query(
    `UPDATE content_versions SET restored_from_version=$1
     WHERE content_id=$2 AND organization_id=$3 AND version=$4`,
    [version, contentId, orgId, restored.version]
  );
  return restored;
}

export async function duplicateContent(id: string, orgId: string, userId: string): Promise<ContentItem> {
  const source = await getById(id, orgId);
  const duplicate = await create(orgId, {
    title: `${source.title} copy`, body: source.body || '', excerpt: source.excerpt || undefined,
    type: source.type, format: source.format, platform: source.platform || undefined,
    campaign_id: source.campaign_id || undefined, template_id: source.template_id || undefined,
    metadata: { ...source.metadata, duplicated_from: source.id }, parent_id: source.id,
  }, userId);
  const result = await query(
    `UPDATE content_items SET root_content_id=$1,source_content_id=$2,
       transformation_type='duplicate',reuse_score=100,updated_at=NOW()
     WHERE id=$3 AND organization_id=$4 RETURNING *`,
    [source.root_content_id || source.id, source.id, duplicate.id, orgId]
  );
  return mapContentRow(result.rows[0]);
}

export async function findReusableContent(
  orgId: string,
  input: { query?: string; type?: string; platform?: string; limit?: number }
): Promise<Array<Record<string, unknown>>> {
  const search = String(input.query || '').trim();
  const result = await query(
    `SELECT id,title,type,platform,version,quality_score,performance_summary,root_content_id,source_content_id,
            LEAST(100,
              (CASE WHEN $2::text IS NULL OR type=$2 THEN 35 ELSE 0 END) +
              (CASE WHEN $3::text IS NULL OR platform=$3 THEN 25 ELSE 0 END) +
              LEAST(25,quality_score/4) +
              (CASE WHEN $4::text IS NULL THEN 10 ELSE
                15*ts_rank(to_tsvector('simple',COALESCE(title,'')||' '||COALESCE(body,'')),plainto_tsquery('simple',$4)) END)
            )::numeric(6,3) AS reuse_score
     FROM content_items
     WHERE organization_id=$1 AND deleted_at IS NULL AND status IN ('approved','published')
       AND ($2::text IS NULL OR type=$2)
       AND ($3::text IS NULL OR platform=$3 OR platform IS NULL)
     ORDER BY reuse_score DESC,updated_at DESC LIMIT $5`,
    [orgId, input.type || null, input.platform || null, search || null, Math.max(1, Math.min(input.limit || 10, 25))]
  );
  return result.rows;
}

export async function adaptContent(
  sourceId: string,
  orgId: string,
  userId: string,
  input: { title?: string; type?: ContentType; platform?: ContentPlatform; transformation_type?: string }
): Promise<ContentItem> {
  const source = await getById(sourceId, orgId);
  if (!['approved','published'].includes(source.status)) {
    throw new AppError(409, 'Only approved or published content can be reused', 'CONTENT_REUSE_SOURCE_UNAPPROVED');
  }
  const adapted = await create(orgId, {
    title: input.title || `${source.title} — adapted`, body: source.body || '', excerpt: source.excerpt || undefined,
    type: input.type || source.type, format: source.format, platform: input.platform || source.platform || undefined,
    campaign_id: source.campaign_id || undefined,
    metadata: { ...source.metadata, reuse: { source_content_id: source.id, source_version: source.version } },
    parent_id: source.id,
  }, userId);
  const result = await query(
    `UPDATE content_items SET root_content_id=$1,source_content_id=$2,
       transformation_type=$3,reuse_score=100,status='draft',workflow_state='draft',updated_at=NOW()
     WHERE id=$4 AND organization_id=$5 RETURNING *`,
    [source.root_content_id || source.id, source.id, String(input.transformation_type || 'adaptation').slice(0, 80), adapted.id, orgId]
  );
  return mapContentRow(result.rows[0]);
}

export async function reviseContent(
  id: string,
  orgId: string,
  userId: string,
  input: { instruction: string; selected_text?: string; idempotency_key?: string }
): Promise<ContentItem> {
  const content = await getById(id, orgId);
  const instruction = String(input.instruction || '').trim();
  if (!instruction) throw new AppError(400, 'A revision instruction is required', 'VALIDATION_ERROR');
  const selected = String(input.selected_text || '');
  if (selected && !(content.body || '').includes(selected)) {
    throw new AppError(409, 'The selected text no longer matches this version', 'CONTENT_SELECTION_STALE');
  }
  const prompt = `Revise the supplied marketing copy according to the owner instruction.
Preserve every factual claim, approved offer, call to action and brand constraint unless the instruction explicitly changes owner-supplied wording. Never invent facts, statistics, testimonials, guarantees or certifications.
Return only the revised ${selected ? 'selection' : 'complete asset'}.

OWNER INSTRUCTION:
${instruction}

${selected ? 'SELECTED COPY' : 'CURRENT ASSET'}:
${selected || content.body || ''}`;
  const result = await generateGovernedText({
    organizationId: orgId, userId, campaignId: content.campaign_id,
    idempotencyKey: input.idempotency_key,
    title: `Revise content: ${content.title}`,
    summary: selected ? 'Revise only the selected section' : 'Revise this individual asset',
    prompt, maxTokens: getMaxTokens(content.type), temperature: 0.5,
    payload: { purpose: 'targeted_revision', content_id: id, content_version: content.version },
  });
  const nextBody = selected ? (content.body || '').replace(selected, result.content) : result.content;
  const revised = await update(id, orgId, {
    body: nextBody,
    metadata: { ...content.metadata, last_revision_instruction: instruction },
    status: 'draft',
  }, userId);
  await contentQuality.runQualityChecks(revised.id, orgId);
  return getById(revised.id, orgId);
}

export async function reviseContentFromOwnerFeedback(
  id: string,
  orgId: string,
  userId: string,
  input: {
    instruction: string;
    decision: 'changes_requested' | 'rejected';
    approval_id: string;
    idempotency_key: string;
  }
): Promise<ContentItem> {
  const original = await getById(id, orgId);
  let content = await reviseContent(id, orgId, userId, {
    instruction: input.decision === 'rejected'
      ? `Create a materially different replacement for this rejected asset. Do not merely paraphrase it. Address the owner's reason while preserving only grounded business facts and the campaign requirement. Owner reason: ${input.instruction}`
      : input.instruction,
    idempotency_key: `${input.idempotency_key}:targeted`,
  });

  await query(
    `UPDATE content_items SET metadata=COALESCE(metadata,'{}'::jsonb) || $1::jsonb,
       transformation_type=$2,updated_at=NOW()
     WHERE id=$3 AND organization_id=$4`,
    [JSON.stringify({ owner_feedback_revision: {
      approval_id: input.approval_id,
      decision: input.decision,
      source_version: original.version,
      instruction: input.instruction,
    } }), input.decision === 'rejected' ? 'owner_rejection_replacement' : 'owner_requested_revision', id, orgId]
  );
  content = await getById(id, orgId);

  let quality = await contentQuality.runQualityChecks(id, orgId);
  for (let attempt = 1; !quality.passed && attempt <= 2; attempt += 1) {
    const issues = quality.checks.flatMap((check) =>
      check.issues.map((issue) => `${check.check_type}: ${issue.message}`)
    );
    const result = await generateGovernedText({
      organizationId: orgId,
      userId,
      campaignId: content.campaign_id,
      idempotencyKey: `${input.idempotency_key}:quality:${attempt}`,
      title: `Owner-feedback quality revision ${attempt}: ${content.title}`,
      summary: 'Bounded quality repair after owner feedback',
      prompt: `Revise this asset to satisfy the owner's feedback and resolve every listed quality failure. Preserve grounded facts and campaign intent. Never invent claims, pricing, proof, testimonials or guarantees. Return only the complete revised asset.\n\nOWNER FEEDBACK:\n${input.instruction}\n\nQUALITY FAILURES:\n${issues.join('\n')}\n\nASSET:\n${content.body || ''}`,
      maxTokens: getMaxTokens(content.type),
      temperature: 0.4,
      payload: { purpose: 'owner_feedback_quality_revision', content_id: id, approval_id: input.approval_id, attempt },
    });
    content = await update(id, orgId, {
      body: result.content,
      metadata: { ...content.metadata, owner_feedback_quality_revisions: attempt },
    }, userId);
    quality = await contentQuality.runQualityChecks(id, orgId);
  }

  if (!quality.passed) {
    await query(
      "UPDATE content_items SET status='draft',workflow_state='needs_revision',updated_at=NOW() WHERE id=$1 AND organization_id=$2",
      [id, orgId]
    );
    throw new AppError(409, 'Owner-feedback revision failed bounded quality checks', 'CONTENT_OWNER_FEEDBACK_QUALITY_FAILED');
  }
  await query(
    "UPDATE content_items SET status='draft',workflow_state='ready_for_review',updated_at=NOW() WHERE id=$1 AND organization_id=$2",
    [id, orgId]
  );
  return getById(id, orgId);
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
  let campaignPlan: Record<string, any> | null = null;
  if (request.campaign_plan_id) {
    const planResult = await query(
      `SELECT * FROM campaign_plans
       WHERE id=$1 AND organization_id=$2`,
      [request.campaign_plan_id, orgId]
    );
    if (planResult.rows.length === 0) throw new NotFoundError('Campaign plan');
    campaignPlan = planResult.rows[0] as Record<string, any>;
    if (String(campaignPlan.strategy_validation_status || 'pending') !== 'valid') {
      throw new AppError(
        409,
        'Resolve campaign strategy validation exceptions before generating its assets',
        'CAMPAIGN_PLAN_VALIDATION_REQUIRED'
      );
    }
  }

  // 1. Create generation job
  const job = await createGenerationJob(orgId, request, userId);
  if (job.status === 'completed' && job.content_id) {
    return { content: await getById(job.content_id, orgId), job };
  }

  try {
    // 2. Update job status to planning
    await updateJobStatus(job.id, 'planning');

    // 3. Build context using Context Engine
    const productScopes = normalizeProductScopes(request.product_lines ?? request.product_line);
    const context = await contextEngine.assemble({
      orgId: orgId,
      agentId: '', // No specific agent for content generation
      includeBrandDna: true,
      includeKnowledge: true,
      includeHistory: false,
      productScopes,
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
    let libraryTemplate: Record<string,any> | null = null;
    if (request.library_item_id) {
      const selectedLibraryTemplate = await getLibraryItem(orgId,request.library_item_id);
      if (selectedLibraryTemplate.approval_status !== 'approved' || !['copy_template','social_post_template','social_ad_template','email_template','landing_page_template','article_template','offer_template','retargeting_template'].includes(String(selectedLibraryTemplate.kind))) {
        throw new AppError(409,'Select an approved content-capable Marketing Library template','LIBRARY_TEMPLATE_NOT_USABLE');
      }
      libraryTemplate=selectedLibraryTemplate;
      prompt = `${prompt}\n\nAPPROVED MARKETING LIBRARY STRUCTURE:\n${JSON.stringify(selectedLibraryTemplate.definition,null,2)}\nUse this as structure only. Resolve placeholders exclusively from verified context or explicit owner input.`;
    }

    // 5. Prefer an approved high-quality asset as adaptation context before
    // asking for net-new ideation. Approval is never inherited by the output.
    const reusable = await findReusableContent(orgId, {
      query: `${request.title || ''} ${request.prompt}`,
      type: request.type,
      platform: request.platform,
      limit: 1,
    });
    const reuseSource = reusable[0] && Number(reusable[0].reuse_score || 0) >= 55
      ? await getById(String(reusable[0].id), orgId)
      : null;
    const fullPrompt = `${buildGenerationPrompt(prompt, context, request, campaignPlan)}${reuseSource
      ? `\n\nAPPROVED REUSE SOURCE (adapt; do not copy blindly):\n${reuseSource.body || ''}`
      : ''}`;

    // 6. Update job status to generating
    await updateJobStatus(job.id, 'generating');

    // 7. Generate content via Provider Router
    const attempt = Number(job.attempt_count || 0) + 1;
    const aiResponse = await generateGovernedText({
      organizationId: orgId,
      userId,
      campaignId: request.campaign_id,
      generationJobId: job.id,
      idempotencyKey: `${request.idempotency_key || `content:${job.id}`}:attempt:${attempt}`,
      title: `Generate ${request.type} content`,
      summary: request.title || request.prompt.slice(0, 160),
      prompt: fullPrompt,
      maxTokens: getMaxTokens(request.type),
      temperature: 0.7,
      payload: {
        campaign_plan_id: request.campaign_plan_id || null,
        brief_id: request.brief_id || null,
        content_type: request.type,
        platform: request.platform || null,
      },
      onAuthorized: async () => {
        await query('UPDATE content_generation_jobs SET attempt_count=$1,updated_at=NOW() WHERE id=$2', [attempt, job.id]);
      },
    });

    const generatedText = aiResponse.content;

    // 8. Create content item
    let content = await create(orgId, {
      title: request.title || generateTitle(request.type, request.platform),
      body: generatedText,
      type: request.type,
      platform: request.platform,
      campaign_id: request.campaign_id,
      template_id: request.template_id,
      metadata: {
        generation_request: request,
        library_item_id: request.library_item_id || null,
        campaign_plan_id: request.campaign_plan_id || null,
        brief_id: request.brief_id || null,
        alt_text: request.alt_text || null,
        quality_brief: {
          audience: request.audience || null,
          objective: request.objective || null,
          offer: request.offer || null,
          calls_to_action: request.calls_to_action || [],
          prohibited_claims: request.prohibited_claims || [],
          required_terms: request.required_terms || [],
          campaign_concept: campaignPlan
            ? (typeof campaignPlan.creative_concept === 'string'
                ? JSON.parse(campaignPlan.creative_concept).name
                : campaignPlan.creative_concept?.name)
            : null,
        },
        context_used: {
          brand_dna: !!context.brandDna,
          knowledge: !!context.knowledge,
        },
        reuse_source: reuseSource ? { content_id: reuseSource.id, version: reuseSource.version } : null,
      },
    }, userId);
    if(libraryTemplate) await recordLibraryUsage(orgId,String(libraryTemplate.id),{eventType:'used',metrics:{content_id:content.id}});

    if (reuseSource) {
      const linked = await query(
        `UPDATE content_items SET root_content_id=$1,source_content_id=$2,
           transformation_type='ai_adaptation',reuse_score=$3 WHERE id=$4 RETURNING *`,
        [reuseSource.root_content_id || reuseSource.id, reuseSource.id, reusable[0].reuse_score, content.id]
      );
      content = mapContentRow(linked.rows[0]);
    }

    // 9. Mark as AI generated
    await query(
      `UPDATE content_items SET ai_generated = TRUE, ai_model = $1, ai_prompt = $2, ai_context = $3 WHERE id = $4`,
      [env.DEFAULT_TEXT_MODEL, prompt, JSON.stringify({ brandDna: context.brandDna?.substring(0, 200), knowledge: context.knowledge?.substring(0, 200) }), content.id]
    );

    let quality = await contentQuality.runQualityChecks(content.id, orgId);
    for (let revision = 1; !quality.passed && revision <= 2; revision += 1) {
      const issues = quality.checks.flatMap((check) => check.issues.map((issue) => `${check.check_type}: ${issue.message}`));
      const revised = await generateGovernedText({
        organizationId: orgId,
        userId,
        campaignId: request.campaign_id,
        generationJobId: job.id,
        idempotencyKey: `${request.idempotency_key || `content:${job.id}`}:quality-revision:${revision}`,
        title: `Quality revision ${revision}: ${content.title}`,
        summary: 'Bounded automatic revision before owner review',
        prompt: `Revise this customer-facing asset to resolve the listed quality failures. Preserve supported facts, offer, brand constraints, intended audience, and CTA. Never invent claims or proof. Return only the complete revised asset.\n\nFAILURES:\n${issues.join('\n')}\n\nASSET:\n${content.body || ''}`,
        maxTokens: getMaxTokens(request.type),
        temperature: 0.4,
        payload: { purpose: 'bounded_quality_revision', content_id: content.id, revision },
      });
      content = await update(content.id, orgId, {
        body: revised.content,
        metadata: { ...content.metadata, automatic_quality_revisions: revision },
      }, userId);
      quality = await contentQuality.runQualityChecks(content.id, orgId);
    }
    await query(
      `UPDATE content_items SET workflow_state=$1,status='draft',updated_at=NOW() WHERE id=$2`,
      [quality.passed ? 'ready_for_review' : 'needs_revision', content.id]
    );

    // 10. Update job as completed
    const latency = Date.now() - startTime;
    await query(
      `UPDATE content_generation_jobs SET status = 'completed', content_id = $1, output = $2, latency_ms = $3, completed_at = NOW() WHERE id = $4`,
      [content.id, JSON.stringify({ text: content.body, quality_passed: quality.passed }), latency, job.id]
    );

    logger.info(`Content generated: ${content.id} in ${latency}ms`);
    return { content: await getById(content.id, orgId), job: { ...job, status: 'completed', content_id: content.id } };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    await query(
      `UPDATE content_generation_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [message, job.id]
    );
    if (error instanceof AppError) throw error;
    throw new AppError(500, `Content generation failed: ${message}`, 'GENERATION_ERROR');
  }
}

async function createGenerationJob(orgId: string, request: GenerateContentRequest, userId: string): Promise<ContentGenerationJob> {
  const result = await query(
    `INSERT INTO content_generation_jobs
       (organization_id, type, platform, input, template_id, created_by, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET updated_at=NOW()
     RETURNING *`,
    [
      orgId,
      request.type,
      request.platform || null,
      JSON.stringify(request),
      request.template_id || null,
      userId,
      request.idempotency_key || null,
    ]
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
  request: GenerateContentRequest,
  campaignPlan?: Record<string, any> | null
): string {
  const parts: string[] = [];

  if (context.brandDna) {
    parts.push(`BRAND VOICE:\n${context.brandDna}`);
  }

  if (context.knowledge) {
    parts.push(`\nRELEVANT KNOWLEDGE:\n${context.knowledge.substring(0, 1000)}`);
  }

  if (campaignPlan) {
    const campaignContext = {
      brief: typeof campaignPlan.brief === 'string' ? JSON.parse(campaignPlan.brief) : campaignPlan.brief,
      strategy: typeof campaignPlan.strategy === 'string' ? JSON.parse(campaignPlan.strategy) : campaignPlan.strategy,
      creative_concept: typeof campaignPlan.creative_concept === 'string' ? JSON.parse(campaignPlan.creative_concept) : campaignPlan.creative_concept,
      messaging_plan: typeof campaignPlan.messaging_plan === 'string' ? JSON.parse(campaignPlan.messaging_plan) : campaignPlan.messaging_plan,
      constraints: typeof campaignPlan.constraints === 'string' ? JSON.parse(campaignPlan.constraints) : campaignPlan.constraints,
      strategy_validation_status: campaignPlan.strategy_validation_status,
    };
    parts.push(`\nINTERNALLY VALIDATED CAMPAIGN STRATEGY:\n${JSON.stringify(campaignContext, null, 2)}`);
  }

  parts.push(`\nTASK: ${prompt}`);
  parts.push(`AUDIENCE: ${request.audience || 'Use the approved campaign audience or supplied business context.'}`);
  parts.push(`OBJECTIVE: ${request.objective || 'Use the approved campaign objective.'}`);
  if (request.offer) parts.push(`APPROVED OFFER: ${request.offer}`);
  if (request.calls_to_action?.length) parts.push(`APPROVED CALLS TO ACTION: ${request.calls_to_action.join(' | ')}`);
  if (request.creative_direction) parts.push(`CREATIVE DIRECTION: ${request.creative_direction}`);
  if (request.prohibited_claims?.length) parts.push(`PROHIBITED CLAIMS: ${request.prohibited_claims.join(' | ')}`);
  parts.push(`QUALITY RULES:
- Do not invent facts, prices, statistics, testimonials, guarantees, certifications or product capabilities.
- If a required fact is missing, use a clearly marked owner placeholder or omit the claim.
- Write specifically for the selected audience, objective, format and platform.
- Avoid generic filler, repeated ideas and clichÃ©s.
- Preserve the approved offer and campaign concept.
- Include one clear approved next step where appropriate.
- Return only the finished customer-facing asset, not analysis, prompts or model commentary.`);

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
    // Provider internals and raw prompts are deliberately not exposed through
    // the customer-facing Studio API.
    ai_model: null,
    ai_prompt: null,
    ai_context: typeof row.ai_context === 'string' ? JSON.parse(row.ai_context) : (row.ai_context as Record<string, unknown>) || {},
    template_id: row.template_id as string | null,
    parent_id: row.parent_id as string | null,
    root_content_id: row.root_content_id as string | null,
    source_content_id: row.source_content_id as string | null,
    transformation_type: row.transformation_type as string | null,
    reuse_score: Number(row.reuse_score || 0),
    performance_summary: typeof row.performance_summary === 'string' ? JSON.parse(row.performance_summary) : (row.performance_summary as Record<string, unknown>) || {},
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
    attempt_count: parseInt(row.attempt_count as string) || 0,
  };
}
