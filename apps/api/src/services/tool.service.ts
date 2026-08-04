import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import * as memoryService from '../memory/memory.service';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../types';

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

const internalHandlers: Record<string, InternalHandler> = {
  web_search: async (_input, _orgId) => {
    return { result: 'Web search not yet implemented', status: 'placeholder' };
  },

  generate_text: async (input, orgId) => {
    const prompt = (input.prompt as string) || '';
    const model = (input.model as string) || 'gpt-4o-mini';
    const maxTokens = (input.max_tokens as number) || 1000;
    const temperature = (input.temperature as number) || 0.7;

    const messages: ChatMessage[] = [
      { role: 'user', content: prompt },
    ];

    const result = await providerRouter.routeRequest(messages, model, {
      max_tokens: maxTokens,
      temperature,
    }, {
      organizationId: orgId,
    });

    return {
      text: result.content,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  },

  analyze_seo: async (_input, _orgId) => {
    return { result: 'SEO analysis not yet implemented', status: 'placeholder' };
  },

  create_social_post: async (input, orgId) => {
    const { content, platform, campaign_id, scheduled_at, metadata } = input as {
      content: string;
      platform: string;
      campaign_id?: string;
      scheduled_at?: string;
      metadata?: Record<string, unknown>;
    };

    const result = await query(
      `INSERT INTO social_posts (id, organization_id, campaign_id, content, platform, status, scheduled_at, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        uuidv4(),
        orgId,
        campaign_id || null,
        content,
        platform,
        scheduled_at ? 'scheduled' : 'draft',
        scheduled_at ? new Date(scheduled_at) : null,
        JSON.stringify(metadata || {}),
      ]
    );

    return { post: result.rows[0] };
  },

  send_email: async (_input, _orgId) => {
    return { result: 'Email sending not yet implemented', status: 'placeholder' };
  },

  get_analytics: async (input, orgId) => {
    const { entity_type, entity_id, start_date, end_date, metrics } = input as {
      entity_type?: string;
      entity_id?: string;
      start_date?: string;
      end_date?: string;
      metrics?: string[];
    };

    let sql = `SELECT * FROM analytics WHERE organization_id = $1`;
    const params: any[] = [orgId];
    let paramCount = 2;

    if (entity_type) {
      sql += ` AND entity_type = $${paramCount++}`;
      params.push(entity_type);
    }

    if (entity_id) {
      sql += ` AND entity_id = $${paramCount++}`;
      params.push(entity_id);
    }

    if (start_date) {
      sql += ` AND created_at >= $${paramCount++}`;
      params.push(new Date(start_date));
    }

    if (end_date) {
      sql += ` AND created_at <= $${paramCount++}`;
      params.push(new Date(end_date));
    }

    sql += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await query(sql, params);

    return {
      events: result.rows,
      count: result.rows.length,
    };
  },

  search_knowledge: async (input, orgId) => {
    const searchQuery = (input.query as string) || '';
    const limit = (input.limit as number) || 10;

    const memoryResults = await memoryService.search(searchQuery, orgId, 'knowledge', limit);

    if (memoryResults.length > 0) {
      return {
        results: memoryResults.map((m) => ({
          key: m.key,
          value: m.value,
          type: m.type,
        })),
        count: memoryResults.length,
      };
    }

    const result = await query(
      `SELECT id, title, content, type, metadata
       FROM knowledge_items
       WHERE organization_id = $1
         AND deleted_at IS NULL
         AND status = 'active'
         AND (title ILIKE $2 OR content ILIKE $2)
       ORDER BY updated_at DESC
       LIMIT $3`,
      [orgId, `%${searchQuery}%`, limit]
    );

    return {
      results: result.rows,
      count: result.rows.length,
    };
  },

  generate_image: async (_input, _orgId) => {
    return { result: 'Image generation not yet implemented', status: 'placeholder' };
  },

  schedule_post: async (input, orgId) => {
    const { content, platform, scheduled_at, campaign_id, metadata } = input as {
      content: string;
      platform: string;
      scheduled_at: string;
      campaign_id?: string;
      metadata?: Record<string, unknown>;
    };

    if (!scheduled_at) {
      throw new AppError(400, 'scheduled_at is required', 'VALIDATION_ERROR');
    }

    const result = await query(
      `INSERT INTO social_posts (id, organization_id, campaign_id, content, platform, status, scheduled_at, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        uuidv4(),
        orgId,
        campaign_id || null,
        content,
        platform,
        new Date(scheduled_at),
        JSON.stringify(metadata || {}),
      ]
    );

    return { post: result.rows[0] };
  },

  create_task: async (input, orgId) => {
    const { name, type, description, agent_id, campaign_id, priority } = input as {
      name: string;
      type: string;
      description?: string;
      agent_id?: string;
      campaign_id?: string;
      priority?: number;
    };

    if (!name || !type) {
      throw new AppError(400, 'name and type are required', 'VALIDATION_ERROR');
    }

    const result = await query(
      `INSERT INTO tasks (id, organization_id, agent_id, campaign_id, name, type, status, input, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), NOW())
       RETURNING *`,
      [
        uuidv4(),
        orgId,
        agent_id || null,
        campaign_id || null,
        name,
        type,
        JSON.stringify({
          description: description || '',
          priority: priority || 5,
        }),
      ]
    );

    return { task: result.rows[0] };
  },
};

export async function list(orgId: string, category?: string): Promise<Tool[]> {
  let sql = `SELECT * FROM tools WHERE (organization_id = $1 OR organization_id IS NULL) AND is_active = true`;
  const params: any[] = [orgId];
  let paramCount = 2;

  if (category) {
    sql += ` AND category = $${paramCount++}`;
    params.push(category);
  }

  sql += ` ORDER BY category, name`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getByName(name: string): Promise<Tool | null> {
  const result = await query(
    `SELECT * FROM tools WHERE name = $1 AND is_active = true`,
    [name]
  );

  return result.rows[0] || null;
}

export async function execute(
  toolName: string,
  input: Record<string, unknown>,
  orgId: string
): Promise<ToolCallResult> {
  const startTime = Date.now();

  const tool = await getByName(toolName);

  if (!tool) {
    const internalHandler = internalHandlers[toolName];
    if (!internalHandler) {
      return {
        tool: toolName,
        input,
        output: null,
        success: false,
        error: `Tool not found: ${toolName}`,
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const output = await internalHandler(input, orgId);
      return {
        tool: toolName,
        input,
        output,
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Internal handler ${toolName} failed: ${errorMessage}`);
      return {
        tool: toolName,
        input,
        output: null,
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  try {
    let output: unknown;

    switch (tool.handler_type) {
      case 'internal': {
        const handlerName = tool.handler_config?.handler as string;
        const handler = internalHandlers[handlerName || toolName];

        if (!handler) {
          throw new AppError(500, `No handler found for tool: ${toolName}`, 'TOOL_HANDLER_MISSING');
        }

        output = await handler(input, orgId);
        break;
      }

      case 'plugin': {
        throw new AppError(501, 'Plugin handler not yet implemented', 'NOT_IMPLEMENTED');
      }

      case 'api': {
        const url = tool.handler_config?.url as string;
        const method = (tool.handler_config?.method as string) || 'POST';
        const headers = (tool.handler_config?.headers as Record<string, string>) || {};

        if (!url) {
          throw new AppError(500, 'API handler missing URL configuration', 'TOOL_CONFIG_ERROR');
        }

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw new AppError(response.status, `API call failed: ${response.statusText}`, 'API_ERROR');
        }

        output = await response.json();
        break;
      }

      default:
        throw new AppError(400, `Unknown handler type: ${tool.handler_type}`, 'INVALID_HANDLER_TYPE');
    }

    return {
      tool: toolName,
      input,
      output,
      success: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Tool ${toolName} execution failed: ${errorMessage}`);
    return {
      tool: toolName,
      input,
      output: null,
      success: false,
      error: errorMessage,
      latencyMs: Date.now() - startTime,
    };
  }
}

export async function getToolDefinitions(toolNames: string[]): Promise<Record<string, unknown>[]> {
  if (toolNames.length === 0) {
    return [];
  }

  const result = await query(
    `SELECT name, description, input_schema, category FROM tools WHERE name = ANY($1) AND is_active = true`,
    [toolNames]
  );

  if (result.rows.length > 0) {
    return result.rows.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  const defaultTools: Record<string, { description: string; parameters: Record<string, unknown> }> = {
    web_search: {
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Number of results' },
        },
        required: ['query'],
      },
    },
    generate_text: {
      description: 'Generate text using AI',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Text prompt' },
          model: { type: 'string', description: 'AI model to use' },
          max_tokens: { type: 'number', description: 'Maximum tokens' },
          temperature: { type: 'number', description: 'Temperature (0-1)' },
        },
        required: ['prompt'],
      },
    },
    analyze_seo: {
      description: 'Analyze SEO for content',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to analyze' },
          content: { type: 'string', description: 'Content to analyze' },
        },
      },
    },
    create_social_post: {
      description: 'Create a social media post',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Post content' },
          platform: { type: 'string', description: 'Social platform' },
          campaign_id: { type: 'string', description: 'Campaign ID' },
          scheduled_at: { type: 'string', description: 'Schedule date (ISO)' },
        },
        required: ['content', 'platform'],
      },
    },
    send_email: {
      description: 'Send an email',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    get_analytics: {
      description: 'Retrieve analytics data',
      parameters: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'Entity type' },
          entity_id: { type: 'string', description: 'Entity ID' },
          start_date: { type: 'string', description: 'Start date (ISO)' },
          end_date: { type: 'string', description: 'End date (ISO)' },
        },
      },
    },
    search_knowledge: {
      description: 'Search the knowledge base',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Number of results' },
        },
        required: ['query'],
      },
    },
    generate_image: {
      description: 'Generate an image using AI',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image prompt' },
          size: { type: 'string', description: 'Image size' },
          style: { type: 'string', description: 'Image style' },
        },
        required: ['prompt'],
      },
    },
    schedule_post: {
      description: 'Schedule a social media post',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Post content' },
          platform: { type: 'string', description: 'Social platform' },
          scheduled_at: { type: 'string', description: 'Schedule date (ISO)' },
          campaign_id: { type: 'string', description: 'Campaign ID' },
        },
        required: ['content', 'platform', 'scheduled_at'],
      },
    },
    create_task: {
      description: 'Create a new task',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Task name' },
          type: { type: 'string', description: 'Task type' },
          description: { type: 'string', description: 'Task description' },
          agent_id: { type: 'string', description: 'Agent ID' },
          campaign_id: { type: 'string', description: 'Campaign ID' },
          priority: { type: 'number', description: 'Priority (1-10)' },
        },
        required: ['name', 'type'],
      },
    },
  };

  return toolNames
    .filter((name) => defaultTools[name])
    .map((name) => ({
      type: 'function',
      function: {
        name,
        description: defaultTools[name].description,
        parameters: defaultTools[name].parameters,
      },
    }));
}

export async function registerTool(tool: Omit<Tool, 'id'>): Promise<Tool> {
  const result = await query(
    `INSERT INTO tools (id, name, description, category, input_schema, output_schema, handler_type, handler_config, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      uuidv4(),
      tool.name,
      tool.description,
      tool.category,
      JSON.stringify(tool.input_schema),
      JSON.stringify(tool.output_schema),
      tool.handler_type,
      JSON.stringify(tool.handler_config),
      tool.is_active,
    ]
  );

  logger.info(`Tool registered: ${tool.name}`);
  return result.rows[0];
}

export const toolService = {
  list,
  getByName,
  execute,
  getToolDefinitions,
  registerTool,
};

export default toolService;
