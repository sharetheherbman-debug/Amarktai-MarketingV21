import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { generateGovernedText } from './governed-text-generation.service';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../types';
import * as socialService from './social-publishing.service';
import * as knowledgeService from './knowledge.service';
import * as externalIntegrations from './external-integrations.service';
import * as studioService from './studio.service';
import { publishPostThroughControlCentre, schedulePostThroughControlCentre } from './controlled-social-publishing.service';
import { deliverEmailBatchThroughControlCentre } from './controlled-email-delivery.service';
import { safeFetch } from '../utils/safe-fetch';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  handler_type: string;
  handler_config: Record<string, unknown>;
  is_active: boolean;
}

export interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  error?: string;
  latencyMs: number;
}

type InternalHandler = (input: Record<string, unknown>, orgId: string) => Promise<unknown>;

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function xmlValue(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match
    ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    : '';
}

async function webSearch(input: Record<string, unknown>): Promise<unknown> {
  const searchText = String(input.query || '').trim();
  if (!searchText) throw new AppError(400, 'query is required', 'VALIDATION_ERROR');
  const limit = Math.max(1, Math.min(Number(input.limit || 8), 20));
  const response = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchText)}`, {
    headers: { 'User-Agent': 'EquiProfile-Marketing-Agent/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new AppError(response.status, `Web search returned HTTP ${response.status}`, 'WEB_SEARCH_FAILED');
  const xml = await response.text();
  const items = (xml.match(/<item>[\s\S]*?<\/item>/gi) || []).slice(0, limit);
  return {
    query: searchText,
    results: items.map((item) => ({ title: xmlValue(item, 'title'), url: xmlValue(item, 'link'), snippet: xmlValue(item, 'description') })),
  };
}

async function generateText(input: Record<string, unknown>, orgId: string): Promise<unknown> {
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw new AppError(400, 'prompt is required', 'VALIDATION_ERROR');
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const result = await generateGovernedText({
    organizationId: orgId,
    idempotencyKey: input.idempotency_key ? String(input.idempotency_key) : undefined,
    title: 'Generate agent draft',
    messages,
    maxTokens: Math.max(1, Math.min(Number(input.max_tokens || 1000), 8000)),
    temperature: Number(input.temperature ?? 0.7),
    payload: { purpose: 'agent_text_tool' },
  });
  return { text: result.content, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
}

async function analyzeSeo(input: Record<string, unknown>): Promise<unknown> {
  const content = String(input.content || '').trim();
  const url = String(input.url || '').trim();
  let text = content;
  let title = String(input.title || '').trim();
  if (!text && url) {
    const response = await safeFetch(url, { headers: { 'User-Agent': 'EquiProfile-SEO/1.0' }, timeoutMs: 15000, maxResponseBytes: 2 * 1024 * 1024 });
    if (!response.ok) throw new AppError(response.status, `SEO URL returned HTTP ${response.status}`, 'SEO_FETCH_FAILED');
    const html = await response.text();
    title = title || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
    text = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (!text) throw new AppError(400, 'content or url is required', 'VALIDATION_ERROR');

  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [];
  const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0);
  const headings = content.match(/^#{1,6}\s+.+$/gm)?.length || 0;
  const keyword = String(input.keyword || '').toLowerCase().trim();
  const keywordOccurrences = keyword ? text.toLowerCase().split(keyword).length - 1 : 0;
  const keywordDensity = keyword && words.length > 0 ? (keywordOccurrences / words.length) * 100 : 0;
  const averageSentenceWords = sentences.length > 0 ? words.length / sentences.length : words.length;
  const recommendations: string[] = [];
  if (!title || title.length < 30 || title.length > 65) recommendations.push('Use a descriptive title between 30 and 65 characters.');
  if (words.length < 300) recommendations.push('Expand the content beyond 300 words for a substantial search page.');
  if (headings === 0) recommendations.push('Add descriptive headings to improve structure and scanning.');
  if (averageSentenceWords > 24) recommendations.push('Shorten long sentences to improve readability.');
  if (keyword && (keywordDensity < 0.3 || keywordDensity > 3)) recommendations.push('Use the target keyword naturally at roughly 0.3% to 3% density.');
  const score = Math.max(0, 100 - recommendations.length * 15);
  return { score, word_count: words.length, average_sentence_words: Number(averageSentenceWords.toFixed(1)), headings, keyword, keyword_occurrences: keywordOccurrences, keyword_density: Number(keywordDensity.toFixed(2)), recommendations };
}

async function resolveSocialConnection(orgId: string, input: Record<string, unknown>): Promise<string> {
  if (input.connection_id) return String(input.connection_id);
  const platform = String(input.platform || '').trim();
  if (!platform) throw new AppError(400, 'connection_id or platform is required', 'VALIDATION_ERROR');
  const result = await query(
    `SELECT id FROM social_connections WHERE organization_id = $1 AND platform = $2 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
    [orgId, platform]
  );
  if (result.rows.length === 0) throw new AppError(400, `No active ${platform} connection is configured`, 'SOCIAL_CONNECTION_REQUIRED');
  return String(result.rows[0].id);
}

async function createSocialPost(input: Record<string, unknown>, orgId: string, requireSchedule: boolean): Promise<unknown> {
  const body = String(input.content || input.body || '').trim();
  if (!body) throw new AppError(400, 'content is required', 'VALIDATION_ERROR');
  const contentId = String(input.content_id || '').trim();
  if (!contentId) throw new AppError(400, 'content_id for the exact owner-approved content version is required', 'CONTENT_APPROVAL_REQUIRED');
  const scheduledAt = input.scheduled_at ? String(input.scheduled_at) : undefined;
  if (requireSchedule && !scheduledAt) throw new AppError(400, 'scheduled_at is required', 'VALIDATION_ERROR');
  const connectionId = await resolveSocialConnection(orgId, input);
  const options = {
    campaign_id: input.campaign_id ? String(input.campaign_id) : undefined,
    media_urls: Array.isArray(input.media_urls) ? input.media_urls.map(String) : [],
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map(String) : [],
    scheduled_at: scheduledAt,
  };
  const post = scheduledAt
    ? await schedulePostThroughControlCentre({
        organizationId: orgId, connectionId, body, requestedBy: 'system',
        contentId,
        campaignId: options.campaign_id, mediaUrls: options.media_urls,
        hashtags: options.hashtags, scheduledAt,
        idempotencyKey: input.idempotency_key ? String(input.idempotency_key) : undefined,
      })
    : await socialService.schedulePost(orgId, connectionId, body, { ...options, content_id: contentId });
  return input.publish_now === true
    ? publishPostThroughControlCentre(post.id, orgId, '')
    : post;
}

async function sendEmail(input: Record<string, unknown>, orgId: string): Promise<unknown> {
  const to = String(input.to || '').trim();
  const subject = String(input.subject || '').trim();
  const body = String(input.body || '').trim();
  if (!to || !subject || !body) throw new AppError(400, 'to, subject, and body are required', 'VALIDATION_ERROR');
  const contentId = String(input.content_id || '').trim();
  if (!contentId) throw new AppError(400, 'content_id for the exact owner-approved content version is required', 'CONTENT_APPROVAL_REQUIRED');
  const consentBasis = String(input.consent_basis || '');
  if (!['consent', 'contract', 'legitimate_interest'].includes(consentBasis)) {
    throw new AppError(400, 'consent_basis is required for external email', 'EMAIL_CONSENT_BASIS_REQUIRED');
  }
  return deliverEmailBatchThroughControlCentre({
    organizationId: orgId,
    contentId,
    deliveries: [{ to, subject, html: body, consent_basis: consentBasis as 'consent' | 'contract' | 'legitimate_interest' }],
    actionTitle: `Send email: ${subject}`,
    actionSummary: `Controlled delivery to one recipient`,
    requestedBy: 'system',
    idempotencyKey: input.idempotency_key
      ? String(input.idempotency_key)
      : `agent-email:${Buffer.from(`${to}|${subject}|${body}`).toString('base64url').slice(0, 180)}`,
    payload: { source: 'agent_tool' },
  });
}

async function getAnalytics(input: Record<string, unknown>, orgId: string): Promise<unknown> {
  const external = await externalIntegrations.listAnalyticsSummary(orgId);
  const params: unknown[] = [orgId];
  let sql = 'SELECT * FROM analytics WHERE organization_id = $1';
  if (input.entity_type) { params.push(String(input.entity_type)); sql += ` AND entity_type = $${params.length}`; }
  if (input.entity_id) { params.push(String(input.entity_id)); sql += ` AND entity_id = $${params.length}`; }
  if (input.start_date) { params.push(new Date(String(input.start_date))); sql += ` AND created_at >= $${params.length}`; }
  if (input.end_date) { params.push(new Date(String(input.end_date))); sql += ` AND created_at <= $${params.length}`; }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  const internal = await query(sql, params);
  return { external, internal_events: internal.rows, internal_count: internal.rows.length };
}

async function generateImage(input: Record<string, unknown>, orgId: string): Promise<unknown> {
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw new AppError(400, 'prompt is required', 'VALIDATION_ERROR');
  const member = await query(
    `SELECT user_id FROM organization_members WHERE organization_id = $1 ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1`,
    [orgId]
  );
  if (member.rows.length === 0) throw new AppError(400, 'Organization has no eligible user for generation ownership', 'ORGANIZATION_MEMBER_REQUIRED');
  return studioService.createGeneration(orgId, String(member.rows[0].user_id), {
    type: 'text_to_image',
    model: input.model ? String(input.model) : undefined,
    prompt,
    negative_prompt: input.negative_prompt ? String(input.negative_prompt) : undefined,
    options: objectValue(input.options),
  });
}

async function createTask(input: Record<string, unknown>, orgId: string): Promise<unknown> {
  const name = String(input.name || input.title || '').trim();
  const type = String(input.type || 'general').trim();
  if (!name) throw new AppError(400, 'name is required', 'VALIDATION_ERROR');
  const result = await query(
    `INSERT INTO tasks (id, organization_id, agent_id, campaign_id, name, type, status, input, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,NOW(),NOW()) RETURNING *`,
    [uuidv4(), orgId, input.agent_id || null, input.campaign_id || null, name, type, JSON.stringify({ description: input.description || '', priority: Number(input.priority || 5) })]
  );
  return { task: result.rows[0] };
}

const internalHandlers: Record<string, InternalHandler> = {
  web_search: (input) => webSearch(input),
  generate_text: generateText,
  analyze_seo: (input) => analyzeSeo(input),
  create_social_post: (input, orgId) => createSocialPost(input, orgId, false),
  schedule_post: (input, orgId) => createSocialPost(input, orgId, true),
  send_email: sendEmail,
  get_analytics: getAnalytics,
  search_knowledge: (input, orgId) => knowledgeService.search(orgId, String(input.query || ''), Number(input.limit || 10)),
  generate_image: generateImage,
  create_task: createTask,
};

export async function list(orgId: string, category?: string): Promise<Tool[]> {
  const params: unknown[] = [orgId];
  let sql = 'SELECT * FROM tools WHERE (organization_id = $1 OR organization_id IS NULL) AND is_active = TRUE';
  if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
  sql += ' ORDER BY category, name';
  const result = await query(sql, params);
  return result.rows as Tool[];
}

export async function getByName(name: string, orgId?: string): Promise<Tool | null> {
  const result = orgId
    ? await query('SELECT * FROM tools WHERE name = $1 AND (organization_id = $2 OR organization_id IS NULL) AND is_active = TRUE ORDER BY organization_id NULLS LAST LIMIT 1', [name, orgId])
    : await query('SELECT * FROM tools WHERE name = $1 AND organization_id IS NULL AND is_active = TRUE LIMIT 1', [name]);
  return result.rows[0] as Tool || null;
}

export async function execute(toolName: string, input: Record<string, unknown>, orgId: string): Promise<ToolCallResult> {
  const started = Date.now();
  try {
    const tool = await getByName(toolName, orgId);
    let output: unknown;
    if (!tool) {
      const internal = internalHandlers[toolName];
      if (!internal) throw new AppError(404, `Tool not found: ${toolName}`, 'TOOL_NOT_FOUND');
      output = await internal(input, orgId);
    } else if (tool.handler_type === 'internal') {
      const handlerName = String(objectValue(tool.handler_config).handler || toolName);
      const internal = internalHandlers[handlerName];
      if (!internal) throw new AppError(500, `No internal handler for ${handlerName}`, 'TOOL_HANDLER_MISSING');
      output = await internal(input, orgId);
    } else if (tool.handler_type === 'api' || tool.handler_type === 'plugin') {
      const config = objectValue(tool.handler_config);
      const url = String(config.url || '');
      if (!url) throw new AppError(500, 'Tool URL is missing', 'TOOL_CONFIG_ERROR');
      const method = String(config.method || 'POST').toUpperCase();
      const response = await safeFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(objectValue(config.headers) as Record<string, string>) },
        body: method === 'GET' ? undefined : JSON.stringify(input),
        timeoutMs: Number(config.timeout_ms || 30000),
        maxResponseBytes: 5 * 1024 * 1024,
      });
      const text = await response.text();
      if (!response.ok) throw new AppError(response.status, `Tool API failed: ${text || `HTTP ${response.status}`}`, 'TOOL_API_ERROR');
      try { output = text ? JSON.parse(text) : {}; } catch { output = { text }; }
    } else {
      throw new AppError(400, `Unknown tool handler type: ${tool.handler_type}`, 'INVALID_HANDLER_TYPE');
    }
    return { tool: toolName, input, output, success: true, latencyMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown tool error';
    logger.error(`Tool ${toolName} failed: ${message}`);
    return { tool: toolName, input, output: null, success: false, error: message, latencyMs: Date.now() - started };
  }
}

const defaultDefinitions: Record<string, { description: string; parameters: Record<string, unknown> }> = {
  web_search: { description: 'Search the public web and return result titles, URLs and snippets.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  generate_text: { description: 'Generate text through the configured AI provider.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' }, max_tokens: { type: 'number' }, temperature: { type: 'number' } }, required: ['prompt'] } },
  analyze_seo: { description: 'Analyze supplied content or a public URL for concrete SEO and readability issues.', parameters: { type: 'object', properties: { url: { type: 'string' }, content: { type: 'string' }, title: { type: 'string' }, keyword: { type: 'string' } } } },
  create_social_post: { description: 'Create or immediately publish an exact owner-approved content version through a connected social account.', parameters: { type: 'object', properties: { content_id: { type: 'string' }, connection_id: { type: 'string' }, platform: { type: 'string' }, content: { type: 'string' }, media_urls: { type: 'array', items: { type: 'string' } }, hashtags: { type: 'array', items: { type: 'string' } }, publish_now: { type: 'boolean' } }, required: ['content_id', 'content'] } },
  schedule_post: { description: 'Schedule an exact owner-approved content version through a connected social account.', parameters: { type: 'object', properties: { content_id: { type: 'string' }, connection_id: { type: 'string' }, platform: { type: 'string' }, content: { type: 'string' }, scheduled_at: { type: 'string' }, media_urls: { type: 'array', items: { type: 'string' } }, hashtags: { type: 'array', items: { type: 'string' } } }, required: ['content_id', 'content', 'scheduled_at'] } },
  send_email: { description: 'Send an exact owner-approved, consent-aware email through the organization default provider.', parameters: { type: 'object', properties: { content_id: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, consent_basis: { type: 'string', enum: ['consent','contract','legitimate_interest'] } }, required: ['content_id', 'to', 'subject', 'body', 'consent_basis'] } },
  get_analytics: { description: 'Retrieve synchronized external analytics and internal event data.', parameters: { type: 'object', properties: { entity_type: { type: 'string' }, entity_id: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' } } } },
  search_knowledge: { description: 'Run hybrid semantic and keyword search across organization knowledge.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  generate_image: { description: 'Queue an Amarktai Network image generation and return the persistent generation job.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, negative_prompt: { type: 'string' }, model: { type: 'string' }, options: { type: 'object' } }, required: ['prompt'] } },
  create_task: { description: 'Create a persistent organization task.', parameters: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number' }, agent_id: { type: 'string' }, campaign_id: { type: 'string' } }, required: ['name'] } },
};

export async function getToolDefinitions(toolNames: string[]): Promise<Record<string, unknown>[]> {
  if (toolNames.length === 0) return [];
  const result = await query('SELECT name, description, input_schema FROM tools WHERE name = ANY($1) AND is_active = TRUE', [toolNames]);
  const definitions = new Map<string, Record<string, unknown>>();
  for (const tool of result.rows) definitions.set(String(tool.name), { type: 'function', function: { name: tool.name, description: tool.description, parameters: objectValue(tool.input_schema) } });
  for (const name of toolNames) {
    const fallback = defaultDefinitions[name];
    if (!definitions.has(name) && fallback) definitions.set(name, { type: 'function', function: { name, description: fallback.description, parameters: fallback.parameters } });
  }
  return toolNames.flatMap((name) => definitions.get(name) ? [definitions.get(name)!] : []);
}

export async function registerTool(tool: Omit<Tool, 'id'> & { organization_id?: string | null }): Promise<Tool> {
  const result = await query(
    `INSERT INTO tools (id, organization_id, name, description, category, input_schema, output_schema, handler_type, handler_config, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [uuidv4(), tool.organization_id || null, tool.name, tool.description, tool.category, JSON.stringify(tool.input_schema), JSON.stringify(tool.output_schema), tool.handler_type, JSON.stringify(tool.handler_config), tool.is_active]
  );
  return result.rows[0] as Tool;
}

export const toolService = { list, getByName, execute, getToolDefinitions, registerTool };
export default toolService;
