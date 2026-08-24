import { z } from 'zod';

const productScopeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Product/service scopes must be lowercase slug keys');

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(1, 'Name is required').max(255),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  mfa_code: z.string().min(6).max(32).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatar: z.string().url().optional(),
});

export const providerConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url('Invalid base URL'),
  models: z.array(z.string()).min(1, 'At least one model is required'),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
});

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  type: z.enum(['email', 'social', 'ads', 'content', 'sms']),
  product_line: productScopeSchema.optional(),
  product_lines: z.array(productScopeSchema).max(32, 'No more than 32 product/service scopes may be selected').optional(),
  project_id: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
  schedule: z.record(z.unknown()).optional(),
});

export const createContentSchema = z.object({
  title: z.string().max(500).optional(),
  body: z.string().optional(),
  type: z.enum(['blog', 'social', 'email', 'ad', 'video', 'image']),
  format: z.string().optional(),
  platform: z.string().optional(),
  campaign_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  type: z.enum(['content', 'analytics', 'social', 'email', 'research', 'custom']),
  config: z.record(z.unknown()).optional(),
  system_prompt: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const executeAgentSchema = z.object({
  input: z.record(z.unknown()),
  campaign_id: z.string().uuid().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

export const onboardingAdminSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(1, 'Name is required').max(255),
});

export const appConfigureSchema = z.object({
  app_url: z.string().url('Invalid app URL'),
  ssl_enabled: z.boolean().default(false),
  trusted_domains: z.array(z.string()).default([]),
});

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
});

export const promptVariableSchema = z.object({
  name: z.string().min(1, 'Variable name is required'),
  type: z.enum(['string', 'number', 'boolean', 'select']),
  description: z.string().default(''),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  options: z.array(z.string()).optional(),
});

export const createPromptSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string().max(255).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens').optional(),
  category: z.string().min(1, 'Category is required').max(100),
  template: z.string().min(1, 'Template is required'),
  variables: z.array(promptVariableSchema).optional(),
  model_preferences: z.record(z.unknown()).optional(),
  system_prompt: z.string().optional(),
  test_cases: z.array(z.unknown()).optional(),
  organization_id: z.string().uuid().optional(),
});

export const updatePromptSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().max(255).regex(/^[a-z0-9-]+$/).optional(),
  category: z.string().min(1).max(100).optional(),
  template: z.string().min(1).optional(),
  variables: z.array(promptVariableSchema).optional(),
  model_preferences: z.record(z.unknown()).optional(),
  system_prompt: z.string().optional(),
  test_cases: z.array(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().optional(),
});

export const renderPromptSchema = z.object({
  variables: z.record(z.unknown()).default({}),
  organization_id: z.string().uuid().optional(),
});

export const rollbackPromptSchema = z.object({
  version: z.number().int().min(1, 'Version number is required'),
  organization_id: z.string().uuid().optional(),
});

export const createBrandDnaSchema = z.object({
  company_name: z.string().min(1, 'Company name is required').max(255).optional(),
  companyName: z.string().min(1, 'Company name is required').max(255).optional(),
  company_description: z.string().max(5000).optional(),
  description: z.string().max(5000).optional(),
  industry: z.string().max(255).optional(),
  products: z.array(z.string()).optional(),
  brand_voice: z.string().max(500).optional(),
  voiceDescription: z.string().max(500).optional(),
  tone: z.string().max(100).optional(),
  target_audience: z.record(z.unknown()).optional(),
  goals: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  writing_style: z.string().max(500).optional(),
  prohibited_phrases: z.array(z.string()).optional(),
  preferred_ctas: z.array(z.string()).optional(),
  colors: z.record(z.unknown()).optional(),
  compliance_rules: z.array(z.string()).optional(),
  complianceRules: z.array(z.string()).optional(),
  logo_url: z.string().max(2000).optional(),
  logoUrl: z.string().max(2000).optional(),
  social_handles: z.record(z.unknown()).optional(),
  socialHandles: z.record(z.unknown()).optional(),
  competitors: z.array(z.unknown()).optional(),
  website_url: z.string().max(2000).optional(),
  websiteUrl: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
  organization_id: z.string().uuid().optional(),
}).passthrough().refine((value) => Boolean(value.company_name || value.companyName), {
  message: 'Company name is required', path: ['company_name'],
});

export const updateBrandDnaSchema = z.object({
  company_name: z.string().min(1).max(255).optional(),
  companyName: z.string().min(1).max(255).optional(),
  company_description: z.string().max(5000).optional(),
  description: z.string().max(5000).optional(),
  industry: z.string().max(255).optional(),
  products: z.array(z.string()).optional(),
  brand_voice: z.string().max(500).optional(),
  voiceDescription: z.string().max(500).optional(),
  tone: z.string().max(100).optional(),
  target_audience: z.record(z.unknown()).optional(),
  goals: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  writing_style: z.string().max(500).optional(),
  prohibited_phrases: z.array(z.string()).optional(),
  preferred_ctas: z.array(z.string()).optional(),
  colors: z.record(z.unknown()).optional(),
  compliance_rules: z.array(z.string()).optional(),
  complianceRules: z.array(z.string()).optional(),
  logo_url: z.string().max(2000).optional(),
  logoUrl: z.string().max(2000).optional(),
  social_handles: z.record(z.unknown()).optional(),
  socialHandles: z.record(z.unknown()).optional(),
  competitors: z.array(z.unknown()).optional(),
  website_url: z.string().max(2000).optional(),
  websiteUrl: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
  organization_id: z.string().uuid().optional(),
}).passthrough();

export const createKnowledgeSourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['website', 'document', 'api', 'rss', 'manual']),
  url: z.string().url('Invalid URL').optional(),
  config: z.record(z.unknown()).optional(),
  organization_id: z.string().uuid().optional(),
});

export const updateKnowledgeSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url('Invalid URL').optional(),
  config: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  organization_id: z.string().uuid().optional(),
});

export const createCompetitorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  url: z.string().url('Invalid URL').optional(),
  description: z.string().optional(),
  industry: z.string().max(255).optional(),
  monitoring_config: z.record(z.unknown()).optional(),
  organization_id: z.string().uuid().optional(),
});

export const updateCompetitorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url('Invalid URL').optional(),
  description: z.string().optional(),
  industry: z.string().max(255).optional(),
  monitoring_config: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  organization_id: z.string().uuid().optional(),
});

export const createTrendMonitorSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(255),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
  alert_threshold: z.number().min(0).max(1).optional(),
  organization_id: z.string().uuid().optional(),
});

export const updateTrendMonitorSchema = z.object({
  topic: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
  alert_threshold: z.number().min(0).max(1).optional(),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().optional(),
});
