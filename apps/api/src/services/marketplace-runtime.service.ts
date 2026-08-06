import { query, transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

interface PackageManifest {
  agents?: Array<Record<string, unknown>>;
  prompts?: Array<Record<string, unknown>>;
  workflows?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
}

function slug(value: unknown, fallback: string): string {
  const text = String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return text || fallback;
}

export async function installItem(orgId: string, itemId: string, userId: string, config: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return transaction(async (client) => {
    const itemResult = await client.query(
      `SELECT * FROM marketplace_items WHERE id = $1 AND deleted_at IS NULL AND status = 'published' FOR UPDATE`,
      [itemId]
    );
    if (itemResult.rows.length === 0) throw new NotFoundError('Published marketplace item');
    const item = itemResult.rows[0];
    const manifestObject = objectValue(item.package_manifest);
    const manifest: PackageManifest = {
      agents: arrayValue(manifestObject.agents),
      prompts: arrayValue(manifestObject.prompts),
      workflows: arrayValue(manifestObject.workflows),
      tools: arrayValue(manifestObject.tools),
    };
    const assetCount = (manifest.agents?.length || 0) + (manifest.prompts?.length || 0) + (manifest.workflows?.length || 0) + (manifest.tools?.length || 0);
    if (assetCount === 0) throw new AppError(400, 'Marketplace item has no installable package manifest', 'MARKETPLACE_PACKAGE_EMPTY');

    const existing = await client.query('SELECT id FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2', [orgId, itemId]);
    if (existing.rows.length > 0) throw new AppError(409, 'Item is already installed', 'ALREADY_INSTALLED');

    const installed: Record<string, string[]> = { agents: [], prompts: [], workflows: [], tools: [] };

    for (const agent of manifest.agents || []) {
      const result = await client.query(
        `INSERT INTO agents
           (organization_id, name, description, type, config, system_prompt, model, provider, capabilities, tools, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11) RETURNING id`,
        [
          orgId,
          String(agent.name || 'Marketplace Agent'),
          agent.description ? String(agent.description) : null,
          String(agent.type || 'worker'),
          JSON.stringify(objectValue(agent.config)),
          agent.system_prompt || agent.systemPrompt ? String(agent.system_prompt || agent.systemPrompt) : null,
          agent.model ? String(agent.model) : null,
          agent.provider ? String(agent.provider) : null,
          JSON.stringify(Array.isArray(agent.capabilities) ? agent.capabilities : []),
          JSON.stringify(Array.isArray(agent.tools) ? agent.tools : []),
          userId,
        ]
      );
      installed.agents.push(String(result.rows[0].id));
    }

    for (const prompt of manifest.prompts || []) {
      const promptSlug = `${slug(prompt.slug || prompt.name, 'marketplace-prompt')}-${itemId.slice(0, 8)}`;
      const result = await client.query(
        `INSERT INTO prompts
           (organization_id, name, slug, category, template, variables, model_preferences, system_prompt, version, is_active, test_cases, performance_score, usage_count, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,TRUE,$9,0,0,$10) RETURNING id`,
        [
          orgId,
          String(prompt.name || 'Marketplace Prompt'),
          promptSlug,
          String(prompt.category || 'marketplace'),
          String(prompt.template || ''),
          JSON.stringify(Array.isArray(prompt.variables) ? prompt.variables : []),
          JSON.stringify(objectValue(prompt.model_preferences)),
          prompt.system_prompt ? String(prompt.system_prompt) : null,
          JSON.stringify(Array.isArray(prompt.test_cases) ? prompt.test_cases : []),
          userId,
        ]
      );
      const promptId = String(result.rows[0].id);
      await client.query(
        `INSERT INTO prompt_versions (prompt_id, organization_id, version, template, variables, model_preferences, system_prompt, created_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7)`,
        [promptId, orgId, String(prompt.template || ''), JSON.stringify(Array.isArray(prompt.variables) ? prompt.variables : []), JSON.stringify(objectValue(prompt.model_preferences)), prompt.system_prompt ? String(prompt.system_prompt) : null, userId]
      );
      installed.prompts.push(promptId);
    }

    for (const workflow of manifest.workflows || []) {
      const result = await client.query(
        `INSERT INTO workflows_v2
           (organization_id, name, description, trigger_type, trigger_config, steps, status, is_template, template_category, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9) RETURNING id`,
        [
          orgId,
          String(workflow.name || 'Marketplace Workflow'),
          workflow.description ? String(workflow.description) : null,
          String(workflow.trigger_type || 'manual'),
          JSON.stringify(objectValue(workflow.trigger_config)),
          JSON.stringify(Array.isArray(workflow.steps) ? workflow.steps : []),
          workflow.is_template === true,
          workflow.template_category ? String(workflow.template_category) : 'marketplace',
          userId,
        ]
      );
      installed.workflows.push(String(result.rows[0].id));
    }

    for (const tool of manifest.tools || []) {
      const toolName = `${slug(tool.name, 'marketplace-tool')}_${itemId.slice(0, 8)}`.replace(/-/g, '_');
      const result = await client.query(
        `INSERT INTO tools
           (id, organization_id, name, description, category, input_schema, output_schema, handler_type, handler_config, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING id`,
        [
          uuidv4(),
          orgId,
          toolName,
          String(tool.description || 'Marketplace tool'),
          String(tool.category || 'marketplace'),
          JSON.stringify(objectValue(tool.input_schema)),
          JSON.stringify(objectValue(tool.output_schema)),
          String(tool.handler_type || 'api'),
          JSON.stringify(objectValue(tool.handler_config)),
        ]
      );
      installed.tools.push(String(result.rows[0].id));
    }

    const installation = await client.query(
      `INSERT INTO marketplace_installations
         (organization_id, item_id, installed_version, config, installed_entities, status, health_status, installed_by)
       VALUES ($1,$2,$3,$4,$5,'active','healthy',$6) RETURNING *`,
      [orgId, itemId, String(item.version || '1.0.0'), JSON.stringify(config), JSON.stringify(installed), userId]
    );
    await client.query('UPDATE marketplace_items SET install_count = install_count + 1 WHERE id = $1', [itemId]);
    return { ...installation.rows[0], item_name: item.name, installed_entities: installed };
  });
}

export async function uninstallItem(orgId: string, itemId: string): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query(
      'SELECT * FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2 FOR UPDATE',
      [orgId, itemId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Marketplace installation');
    const installed = objectValue(result.rows[0].installed_entities);

    const remove = async (table: string, ids: unknown, softDelete = false) => {
      const values = Array.isArray(ids) ? ids.map(String) : [];
      if (values.length === 0) return;
      if (softDelete) {
        await client.query(`UPDATE ${table} SET deleted_at = NOW() WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [orgId, values]);
      } else {
        await client.query(`DELETE FROM ${table} WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [orgId, values]);
      }
    };

    await remove('agents', installed.agents, true);
    await remove('prompts', installed.prompts);
    await remove('workflows_v2', installed.workflows);
    await remove('tools', installed.tools);
    await client.query('DELETE FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2', [orgId, itemId]);
    await client.query('UPDATE marketplace_items SET install_count = GREATEST(install_count - 1, 0) WHERE id = $1', [itemId]);
  });
}

export async function listInstallations(orgId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT mi.*, item.name AS item_name, item.category, item.version AS current_version
     FROM marketplace_installations mi
     JOIN marketplace_items item ON item.id = mi.item_id
     WHERE mi.organization_id = $1 ORDER BY mi.installed_at DESC`,
    [orgId]
  );
  return result.rows;
}
