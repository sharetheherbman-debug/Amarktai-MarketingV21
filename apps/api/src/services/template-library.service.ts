import { query } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface TemplateLibraryItem {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string;
  template_type: string;
  template_data: Record<string, unknown>;
  is_system: boolean;
  is_public: boolean;
  usage_count: number;
  tags: string[];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  category: string;
  template_type: string;
  template_data: Record<string, unknown>;
  is_public?: boolean;
  tags?: string[];
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
  category?: string;
  template_data?: Record<string, unknown>;
  is_public?: boolean;
  tags?: string[];
}

export interface TemplateCategory {
  category: string;
  count: number;
}

const TEMPLATE_CATEGORIES = [
  'campaign', 'workflow', 'prompt', 'brand_dna', 'seo', 'crm', 'onboarding'
];

const TEMPLATE_TYPES = [
  'campaign_template', 'workflow_template', 'prompt_pack', 'brand_dna_template',
  'seo_template', 'crm_template', 'onboarding_template'
];

// Template CRUD
export async function listTemplates(orgId: string, category?: string, templateType?: string): Promise<TemplateLibraryItem[]> {
  let sql = `SELECT * FROM template_library WHERE (organization_id = $1 OR is_public = TRUE)`;
  const params: any[] = [orgId];
  let paramCount = 2;

  if (category) {
    sql += ` AND category = $${paramCount++}`;
    params.push(category);
  }
  if (templateType) {
    sql += ` AND template_type = $${paramCount++}`;
    params.push(templateType);
  }

  sql += ' ORDER BY usage_count DESC, name';
  const result = await query(sql, params);
  return result.rows;
}

export async function getTemplate(templateId: string, orgId: string): Promise<TemplateLibraryItem> {
  const result = await query(
    'SELECT * FROM template_library WHERE id = $1 AND (organization_id = $2 OR is_public = TRUE)',
    [templateId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Template');
  return result.rows[0];
}

export async function createTemplate(orgId: string, userId: string, data: CreateTemplateData): Promise<TemplateLibraryItem> {
  const result = await query(
    `INSERT INTO template_library (organization_id, name, description, category, template_type, template_data, is_public, tags, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      orgId, data.name, data.description || null, data.category,
      data.template_type, JSON.stringify(data.template_data),
      data.is_public || false, JSON.stringify(data.tags || []), userId
    ]
  );

  logger.info(`Template created: ${data.name} (${data.category})`);
  return result.rows[0];
}

export async function updateTemplate(templateId: string, orgId: string, data: UpdateTemplateData): Promise<TemplateLibraryItem> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name !== undefined) { updates.push(`name = $${paramCount++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${paramCount++}`); values.push(data.description); }
  if (data.category !== undefined) { updates.push(`category = $${paramCount++}`); values.push(data.category); }
  if (data.template_data !== undefined) { updates.push(`template_data = $${paramCount++}`); values.push(JSON.stringify(data.template_data)); }
  if (data.is_public !== undefined) { updates.push(`is_public = $${paramCount++}`); values.push(data.is_public); }
  if (data.tags !== undefined) { updates.push(`tags = $${paramCount++}`); values.push(JSON.stringify(data.tags)); }

  if (updates.length === 0) {
    return getTemplate(templateId, orgId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(templateId, orgId);

  const result = await query(
    `UPDATE template_library SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Template');
  logger.info(`Template updated: ${templateId}`);
  return result.rows[0];
}

export async function deleteTemplate(templateId: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM template_library WHERE id = $1 AND organization_id = $2 AND is_system = FALSE',
    [templateId, orgId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Template');
  logger.info(`Template deleted: ${templateId}`);
}

export async function duplicateTemplate(templateId: string, orgId: string, userId: string): Promise<TemplateLibraryItem> {
  const original = await getTemplate(templateId, orgId);
  return createTemplate(orgId, userId, {
    name: `${original.name} (Copy)`,
    description: original.description || undefined,
    category: original.category,
    template_type: original.template_type,
    template_data: original.template_data,
    is_public: false,
    tags: original.tags,
  });
}

export async function incrementUsage(templateId: string): Promise<void> {
  await query(
    'UPDATE template_library SET usage_count = usage_count + 1 WHERE id = $1',
    [templateId]
  );
}

// Categories
export async function getCategories(orgId: string): Promise<TemplateCategory[]> {
  const result = await query(
    `SELECT category, COUNT(*) as count
     FROM template_library
     WHERE organization_id = $1 OR is_public = TRUE
     GROUP BY category
     ORDER BY category`,
    [orgId]
  );
  return result.rows;
}

// System Templates (seeded on first use)
export async function seedSystemTemplates(): Promise<void> {
  const systemTemplates = [
    {
      name: 'Welcome Email Sequence',
      description: 'Standard welcome email sequence for new subscribers',
      category: 'campaign',
      template_type: 'campaign_template',
      template_data: {
        type: 'email',
        steps: [
          { delay_hours: 0, subject: 'Welcome to {{company_name}}!', body: 'Thank you for joining us...' },
          { delay_hours: 24, subject: 'Getting Started Guide', body: 'Here are some tips to get started...' },
          { delay_hours: 72, subject: 'How can we help?', body: 'We wanted to check in...' }
        ]
      },
      tags: ['welcome', 'onboarding', 'email']
    },
    {
      name: 'Social Media Weekly Plan',
      description: 'Weekly social media content plan template',
      category: 'campaign',
      template_type: 'campaign_template',
      template_data: {
        type: 'social',
        schedule: {
          monday: { platform: 'linkedin', content_type: 'article' },
          tuesday: { platform: 'x', content_type: 'post' },
          wednesday: { platform: 'instagram', content_type: 'carousel' },
          thursday: { platform: 'facebook', content_type: 'post' },
          friday: { platform: 'linkedin', content_type: 'post' }
        }
      },
      tags: ['social', 'weekly', 'planning']
    },
    {
      name: 'Content Approval Workflow',
      description: 'Standard content approval workflow with review steps',
      category: 'workflow',
      template_type: 'workflow_template',
      template_data: {
        steps: [
          { type: 'create', name: 'Content Created' },
          { type: 'review', name: 'Manager Review', assignee_role: 'manager' },
          { type: 'approve', name: 'Final Approval', assignee_role: 'admin' },
          { type: 'publish', name: 'Publish' }
        ]
      },
      tags: ['approval', 'workflow', 'content']
    },
    {
      name: 'Blog Post Prompt Pack',
      description: 'Collection of prompts for blog post creation',
      category: 'prompt',
      template_type: 'prompt_pack',
      template_data: {
        prompts: [
          { name: 'Blog Outline', template: 'Create a detailed outline for a blog post about {{topic}} targeting {{audience}}...' },
          { name: 'Blog Introduction', template: 'Write an engaging introduction for a blog post about {{topic}}...' },
          { name: 'Blog Conclusion', template: 'Write a compelling conclusion with a call to action for a blog post about {{topic}}...' }
        ]
      },
      tags: ['blog', 'content', 'prompts']
    },
    {
      name: 'Brand Voice Template',
      description: 'Template for defining brand voice and tone',
      category: 'brand_dna',
      template_type: 'brand_dna_template',
      template_data: {
        brand_voice: 'professional yet approachable',
        tone_guidelines: {
          formal: 'Use for official communications',
          casual: 'Use for social media',
          friendly: 'Use for customer support'
        },
        prohibited_phrases: ['synergy', 'leverage', 'disrupt'],
        preferred_ctas: ['Learn More', 'Get Started', 'Try Free']
      },
      tags: ['brand', 'voice', 'tone']
    },
    {
      name: 'SEO Audit Checklist',
      description: 'Standard SEO audit checklist template',
      category: 'seo',
      template_type: 'seo_template',
      template_data: {
        checks: [
          { name: 'Title Tags', weight: 10 },
          { name: 'Meta Descriptions', weight: 8 },
          { name: 'Header Structure', weight: 9 },
          { name: 'Image Alt Tags', weight: 7 },
          { name: 'Internal Linking', weight: 8 },
          { name: 'Page Speed', weight: 9 },
          { name: 'Mobile Responsiveness', weight: 10 }
        ]
      },
      tags: ['seo', 'audit', 'checklist']
    },
    {
      name: 'Client Onboarding Template',
      description: 'Standard client onboarding workflow template',
      category: 'onboarding',
      template_type: 'onboarding_template',
      template_data: {
        steps: [
          { name: 'Welcome Call', type: 'meeting', duration_minutes: 60 },
          { name: 'Brand Discovery', type: 'form', fields: ['industry', 'target_audience', 'goals'] },
          { name: 'Competitor Analysis', type: 'task', automated: true },
          { name: 'Website Audit', type: 'task', automated: true },
          { name: 'Strategy Presentation', type: 'meeting', duration_minutes: 90 },
          { name: 'Campaign Setup', type: 'task' }
        ]
      },
      tags: ['onboarding', 'client', 'workflow']
    }
  ];

  for (const template of systemTemplates) {
    await query(
      `INSERT INTO template_library (organization_id, name, description, category, template_type, template_data, is_system, is_public, tags)
       VALUES ('00000000-0000-0000-0000-000000000000', $1, $2, $3, $4, $5, TRUE, TRUE, $6)
       ON CONFLICT DO NOTHING`,
      [template.name, template.description, template.category, template.template_type, JSON.stringify(template.template_data), JSON.stringify(template.tags)]
    );
  }

  logger.info('System templates seeded');
}
