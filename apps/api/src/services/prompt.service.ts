import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { Prompt, PromptVersion, PromptVariable, CreatePromptData, UpdatePromptData, TestResult } from '../types';

export async function list(orgId: string, category?: string): Promise<Prompt[]> {
  let sql = 'SELECT * FROM prompts WHERE organization_id = $1 AND is_active = true';
  const params: unknown[] = [orgId];

  if (category) {
    sql += ' AND category = $2';
    params.push(category);
  }

  sql += ' ORDER BY updated_at DESC';

  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function getById(id: string, orgId: string): Promise<Prompt> {
  const result = await query(
    'SELECT * FROM prompts WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Prompt');
  }

  return mapRow(result.rows[0]);
}

export async function getBySlug(slug: string, orgId: string): Promise<Prompt> {
  const result = await query(
    'SELECT * FROM prompts WHERE slug = $1 AND organization_id = $2 AND is_active = true',
    [slug, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Prompt');
  }

  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreatePromptData, userId: string): Promise<Prompt> {
  const slug = data.slug || generateSlug(data.name);

  const existing = await query(
    'SELECT id FROM prompts WHERE slug = $1 AND organization_id = $2',
    [slug, orgId]
  );

  if (existing.rows.length > 0) {
    throw new AppError(409, 'A prompt with this slug already exists', 'CONFLICT');
  }

  const result = await query(
    `INSERT INTO prompts (organization_id, name, slug, category, template, variables, model_preferences, system_prompt, version, is_active, test_cases, performance_score, usage_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, true, $9, 0, 0, $10)
     RETURNING *`,
    [
      orgId,
      data.name,
      slug,
      data.category,
      data.template,
      JSON.stringify(data.variables || []),
      JSON.stringify(data.model_preferences || {}),
      data.system_prompt || null,
      JSON.stringify(data.test_cases || []),
      userId,
    ]
  );

  const prompt = mapRow(result.rows[0]);

  await query(
    `INSERT INTO prompt_versions (prompt_id, organization_id, version, template, variables, model_preferences, system_prompt, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [prompt.id, orgId, 1, data.template, JSON.stringify(data.variables || []), JSON.stringify(data.model_preferences || {}), data.system_prompt || null, userId]
  );

  logger.info(`Prompt created: ${prompt.id} (${slug})`);
  return prompt;
}

export async function update(id: string, orgId: string, data: UpdatePromptData, userId: string): Promise<Prompt> {
  const existing = await query(
    'SELECT * FROM prompts WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Prompt');
  }

  const current = existing.rows[0];
  const newVersion = current.version + 1;

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.slug !== undefined) {
    updates.push(`slug = $${paramCount++}`);
    values.push(data.slug);
  }
  if (data.category !== undefined) {
    updates.push(`category = $${paramCount++}`);
    values.push(data.category);
  }
  if (data.template !== undefined) {
    updates.push(`template = $${paramCount++}`);
    values.push(data.template);
  }
  if (data.variables !== undefined) {
    updates.push(`variables = $${paramCount++}`);
    values.push(JSON.stringify(data.variables));
  }
  if (data.model_preferences !== undefined) {
    updates.push(`model_preferences = $${paramCount++}`);
    values.push(JSON.stringify(data.model_preferences));
  }
  if (data.system_prompt !== undefined) {
    updates.push(`system_prompt = $${paramCount++}`);
    values.push(data.system_prompt);
  }
  if (data.test_cases !== undefined) {
    updates.push(`test_cases = $${paramCount++}`);
    values.push(JSON.stringify(data.test_cases));
  }
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.is_active);
  }

  updates.push(`version = $${paramCount++}`);
  values.push(newVersion);

  updates.push('updated_at = NOW()');

  values.push(id);
  values.push(orgId);

  const result = await query(
    `UPDATE prompts SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} RETURNING *`,
    values
  );

  await query(
    `INSERT INTO prompt_versions (prompt_id, organization_id, version, template, variables, model_preferences, system_prompt, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      orgId,
      newVersion,
      data.template ?? current.template,
      JSON.stringify(data.variables ?? JSON.parse(current.variables || '[]')),
      JSON.stringify(data.model_preferences ?? JSON.parse(current.model_preferences || '{}')),
      data.system_prompt ?? current.system_prompt,
      userId,
    ]
  );

  logger.info(`Prompt updated: ${id} (v${newVersion})`);
  return mapRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'UPDATE prompts SET is_active = false, updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Prompt');
  }

  logger.info(`Prompt deleted: ${id}`);
}

export async function getVersions(promptId: string, orgId: string): Promise<PromptVersion[]> {
  const promptCheck = await query(
    'SELECT id FROM prompts WHERE id = $1 AND organization_id = $2',
    [promptId, orgId]
  );

  if (promptCheck.rows.length === 0) {
    throw new NotFoundError('Prompt');
  }

  const result = await query(
    'SELECT * FROM prompt_versions WHERE prompt_id = $1 AND organization_id = $2 ORDER BY version DESC',
    [promptId, orgId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    prompt_id: row.prompt_id,
    organization_id: row.organization_id,
    version: row.version,
    template: row.template,
    variables: typeof row.variables === 'string' ? JSON.parse(row.variables) : row.variables || [],
    model_preferences: typeof row.model_preferences === 'string' ? JSON.parse(row.model_preferences) : row.model_preferences || {},
    system_prompt: row.system_prompt,
    created_by: row.created_by,
    created_at: row.created_at,
  }));
}

export async function rollback(promptId: string, orgId: string, version: number, userId: string): Promise<Prompt> {
  const versionResult = await query(
    'SELECT * FROM prompt_versions WHERE prompt_id = $1 AND organization_id = $2 AND version = $3',
    [promptId, orgId, version]
  );

  if (versionResult.rows.length === 0) {
    throw new NotFoundError('Prompt version');
  }

  const targetVersion = versionResult.rows[0];

  const updated = await update(
    promptId,
    orgId,
    {
      template: targetVersion.template,
      variables: typeof targetVersion.variables === 'string' ? JSON.parse(targetVersion.variables) : targetVersion.variables,
      model_preferences: typeof targetVersion.model_preferences === 'string' ? JSON.parse(targetVersion.model_preferences) : targetVersion.model_preferences,
      system_prompt: targetVersion.system_prompt,
    },
    userId
  );

  logger.info(`Prompt rolled back: ${promptId} to v${version}`);
  return updated;
}

export async function render(promptId: string, orgId: string, variables: Record<string, unknown>): Promise<{ template: string; systemPrompt: string | null }> {
  const prompt = await getById(promptId, orgId);

  let renderedTemplate = prompt.template;
  let renderedSystemPrompt = prompt.system_prompt;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    const stringValue = String(value ?? '');
    renderedTemplate = renderedTemplate.split(placeholder).join(stringValue);
    if (renderedSystemPrompt) {
      renderedSystemPrompt = renderedSystemPrompt.split(placeholder).join(stringValue);
    }
  }

  const missingRequired: string[] = [];
  for (const v of prompt.variables) {
    if (v.required && !(v.name in variables) && v.default === undefined) {
      missingRequired.push(v.name);
    }
  }

  if (missingRequired.length > 0) {
    throw new AppError(400, `Missing required variables: ${missingRequired.join(', ')}`, 'MISSING_VARIABLES');
  }

  return { template: renderedTemplate, systemPrompt: renderedSystemPrompt };
}

export async function incrementUsage(promptId: string): Promise<void> {
  await query(
    'UPDATE prompts SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1',
    [promptId]
  );
}

export async function runTests(promptId: string, orgId: string, userId: string): Promise<TestResult[]> {
  const prompt = await getById(promptId, orgId);

  if (!prompt.test_cases || prompt.test_cases.length === 0) {
    return [];
  }

  const results: TestResult[] = [];

  for (const testCase of prompt.test_cases) {
    const tc = testCase as { name: string; variables: Record<string, unknown>; expected_contains?: string };
    try {
      const rendered = await render(promptId, orgId, tc.variables);

      let passed = true;
      let error: string | undefined;

      if (tc.expected_contains) {
        passed = rendered.template.includes(tc.expected_contains);
        if (!passed) {
          error = `Template does not contain expected text: "${tc.expected_contains}"`;
        }
      }

      results.push({
        name: tc.name,
        passed,
        variables: tc.variables,
        rendered_template: rendered.template,
        error,
        duration_ms: 0,
      });
    } catch (err) {
      results.push({
        name: tc.name,
        passed: false,
        variables: tc.variables,
        rendered_template: '',
        error: err instanceof Error ? err.message : 'Unknown error',
        duration_ms: 0,
      });
    }
  }

  const allPassed = results.every((r) => r.passed);
  const newScore = allPassed ? 100 : Math.round((results.filter((r) => r.passed).length / results.length) * 100);

  await query(
    'UPDATE prompts SET performance_score = $1, updated_at = NOW() WHERE id = $2',
    [newScore, promptId]
  );

  logger.info(`Prompt tests run: ${promptId} (${results.filter((r) => r.passed).length}/${results.length} passed)`);
  return results;
}

export async function getCategories(orgId: string): Promise<string[]> {
  const result = await query(
    'SELECT DISTINCT category FROM prompts WHERE organization_id = $1 AND is_active = true ORDER BY category',
    [orgId]
  );

  return result.rows.map((row) => row.category);
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapRow(row: Record<string, unknown>): Prompt {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    slug: row.slug as string,
    category: row.category as string,
    template: row.template as string,
    variables: typeof row.variables === 'string' ? JSON.parse(row.variables as string) : (row.variables as PromptVariable[]) || [],
    model_preferences: typeof row.model_preferences === 'string' ? JSON.parse(row.model_preferences as string) : (row.model_preferences as Record<string, unknown>) || {},
    system_prompt: row.system_prompt as string | null,
    version: row.version as number,
    is_active: row.is_active as boolean,
    test_cases: typeof row.test_cases === 'string' ? JSON.parse(row.test_cases as string) : (row.test_cases as unknown[]) || [],
    performance_score: row.performance_score as number,
    usage_count: row.usage_count as number,
    created_by: row.created_by as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}
