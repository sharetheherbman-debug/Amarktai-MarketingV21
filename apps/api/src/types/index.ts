import { Request } from 'express';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  email_verified: boolean;
  email_verification_token: string | null;
  reset_token: string | null;
  reset_token_expires: Date | null;
  two_factor_secret: string | null;
  two_factor_enabled: boolean;
  last_login_at: Date | null;
  settings: Record<string, unknown>;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type UserRole = 'user' | 'admin' | 'superadmin';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  settings: Record<string, unknown>;
  plan: PlanType;
  status: OrgStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type PlanType = 'free' | 'starter' | 'professional' | 'enterprise';
export type OrgStatus = 'active' | 'inactive' | 'suspended';

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  invited_by: string | null;
  joined_at: Date;
}

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  status: ProjectStatus;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type ProjectStatus = 'active' | 'archived';

export interface Campaign {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  type: CampaignType;
  status: CampaignStatus;
  config: Record<string, unknown>;
  schedule: Record<string, unknown>;
  metrics: Record<string, unknown>;
  created_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type CampaignType = 'email' | 'social' | 'ads' | 'content' | 'sms';
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'archived';

export interface Content {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  project_id: string | null;
  title: string | null;
  body: string | null;
  type: ContentType;
  format: string | null;
  platform: string | null;
  status: ContentStatus;
  metadata: Record<string, unknown>;
  ai_generated: boolean;
  ai_model: string | null;
  ai_prompt: string | null;
  published_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type ContentType = 'blog' | 'article' | 'landing_page' | 'sales_page' | 'product_desc' | 'service_page' | 'case_study' | 'faq' | 'newsletter' | 'email' | 'press_release' | 'social' | 'asset' | 'ad' | 'video' | 'image';
export type ContentStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published' | 'archived' | 'scheduled';
export type ContentPlatform = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'threads' | 'pinterest' | 'reddit' | 'youtube' | 'tiktok' | 'email' | 'web';
export type AssetType = 'headline' | 'cta' | 'tagline' | 'hook' | 'caption' | 'description' | 'meta_title' | 'meta_description' | 'schema_summary';

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  type: AgentType;
  config: Record<string, unknown>;
  system_prompt: string | null;
  model: string | null;
  provider: string | null;
  status: AgentStatus;
  capabilities: string[];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type AgentType = 'content' | 'analytics' | 'social' | 'email' | 'research' | 'custom';
export type AgentStatus = 'active' | 'inactive' | 'training';

export interface Task {
  id: string;
  organization_id: string;
  agent_id: string | null;
  campaign_id: string | null;
  name: string;
  type: string;
  status: TaskStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AIProvider {
  id: string;
  organization_id: string | null;
  name: string;
  type: ProviderType;
  api_key_encrypted: string;
  base_url: string;
  config: Record<string, unknown>;
  models: string[];
  enabled: boolean;
  priority: number;
  health_status: HealthStatus;
  last_health_check: Date | null;
  usage_stats: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export type ProviderType = 'genx' | 'together' | 'deepinfra' | 'openai' | 'custom';
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface Memory {
  id: string;
  organization_id: string;
  key: string;
  value: Record<string, unknown>;
  type: MemoryType;
  namespace: string | null;
  metadata: Record<string, unknown>;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type MemoryType = 'business' | 'brand' | 'conversation' | 'knowledge' | 'preference';

export interface Analytics {
  id: string;
  organization_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  created_at: Date;
}

export interface Media {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  url: string;
  size: number | null;
  mime_type: string | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  organization_id: string | null;
  type: string;
  title: string;
  message: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: MemberRole;
  token: string;
  invited_by: string | null;
  accepted: boolean;
  expires_at: Date;
  created_at: Date;
}

export interface Workflow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_type: string | null;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  last_run_at: Date | null;
  run_count: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next: string | null;
}

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface Plugin {
  id: string;
  organization_id: string | null;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  status: string;
  last_sync_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
}

export interface SystemSetting {
  key: string;
  value: Record<string, unknown>;
  updated_at: Date;
  updated_by: string | null;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  priority: number;
}

export interface ProviderHealth {
  name: string;
  status: HealthStatus;
  latency: number;
  lastCheck: Date;
  error?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface CreateOrganizationData {
  name: string;
  slug: string;
}

export interface UpdateProfileData {
  name?: string;
  avatar?: string;
}

export interface ChangePasswordData {
  oldPassword: string;
  newPassword: string;
}

export interface CreateCampaignData {
  name: string;
  description?: string;
  type: CampaignType;
  project_id?: string;
  config?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
}

export interface CreateContentData {
  title: string;
  body?: string;
  excerpt?: string;
  type: ContentType;
  format?: string;
  platform?: ContentPlatform;
  campaign_id?: string;
  project_id?: string;
  template_id?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string;
  assigned_to?: string;
}

export interface UpdateContentData {
  title?: string;
  body?: string;
  excerpt?: string;
  type?: ContentType;
  format?: string;
  platform?: ContentPlatform;
  status?: ContentStatus;
  metadata?: Record<string, unknown>;
  scheduled_at?: string;
  assigned_to?: string;
}

export interface CreateAgentData {
  name: string;
  description?: string;
  type: AgentType;
  config?: Record<string, unknown>;
  system_prompt?: string;
  model?: string;
  provider?: string;
  capabilities?: string[];
}

export interface ExecuteAgentData {
  input: Record<string, unknown>;
  campaign_id?: string;
}

export interface AppConfigureData {
  app_url: string;
  ssl_enabled: boolean;
  trusted_domains: string[];
}

export interface OnboardingAdminData {
  email: string;
  password: string;
  name: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
}

export interface EmbeddingResult {
  embedding: number[];
  token_count: number;
}

export interface ChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ImageGenerateOptions {
  size?: string;
  quality?: string;
  n?: number;
  style?: string;
}

export interface ProviderInterface {
  getName(): string;
  chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<ChatResult>;
  embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]>;
  healthCheck(): Promise<boolean>;
  getModels(): string[];
  imageGenerate?(prompt: string, model: string, options?: ImageGenerateOptions): Promise<string>;
}

export interface PluginInterface {
  id: string;
  name: string;
  version: string;
  description: string;
  hooks: PluginHook[];
  config: PluginConfigSchema;
}

export interface PluginHook {
  name: HookName;
  handler: (data: unknown) => Promise<unknown>;
}

export type HookName = 'onInit' | 'onBeforeRequest' | 'onAfterRequest' | 'onError' | 'onShutdown';

export interface PluginConfigSchema {
  settings: Record<string, {
    type: string;
    required: boolean;
    default?: unknown;
    description?: string;
  }>;
}

export interface QueueJobData {
  type: string;
  payload: Record<string, unknown>;
  organizationId: string;
  userId?: string;
}

export interface ExtendedRequest extends Request {
  user?: AuthPayload;
  organizationId?: string;
}

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  description: string;
  required: boolean;
  default?: unknown;
  options?: string[];
}

export interface Prompt {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  category: string;
  template: string;
  variables: PromptVariable[];
  model_preferences: Record<string, unknown>;
  system_prompt: string | null;
  version: number;
  is_active: boolean;
  test_cases: unknown[];
  performance_score: number;
  usage_count: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  organization_id: string;
  version: number;
  template: string;
  variables: PromptVariable[];
  model_preferences: Record<string, unknown>;
  system_prompt: string | null;
  created_by: string | null;
  created_at: Date;
}

export interface CreatePromptData {
  name: string;
  slug?: string;
  category: string;
  template: string;
  variables?: PromptVariable[];
  model_preferences?: Record<string, unknown>;
  system_prompt?: string;
  test_cases?: unknown[];
}

export interface UpdatePromptData {
  name?: string;
  slug?: string;
  category?: string;
  template?: string;
  variables?: PromptVariable[];
  model_preferences?: Record<string, unknown>;
  system_prompt?: string;
  test_cases?: unknown[];
  is_active?: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  variables: Record<string, unknown>;
  rendered_template: string;
  error?: string;
  duration_ms: number;
}

export interface BrandDna {
  id: string;
  organization_id: string;
  company_name: string;
  industry: string | null;
  brand_voice: string | null;
  target_audience: Record<string, unknown>;
  goals: string[];
  keywords: string[];
  writing_style: string | null;
  prohibited_phrases: string[];
  preferred_ctas: string[];
  colors: Record<string, unknown>;
  fonts: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBrandDnaData {
  company_name: string;
  industry?: string;
  brand_voice?: string;
  target_audience?: Record<string, unknown>;
  goals?: string[];
  keywords?: string[];
  writing_style?: string;
  prohibited_phrases?: string[];
  preferred_ctas?: string[];
  colors?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateBrandDnaData {
  company_name?: string;
  industry?: string;
  brand_voice?: string;
  target_audience?: Record<string, unknown>;
  goals?: string[];
  keywords?: string[];
  writing_style?: string;
  prohibited_phrases?: string[];
  preferred_ctas?: string[];
  colors?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler?: string;
}

export interface AgentDefinition {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  tools: ToolDefinition[];
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface AgentConversation {
  id: string;
  agent_id: string;
  organization_id: string;
  user_id: string;
  messages: ChatMessage[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCallResult[];
  timestamp: Date;
}

export interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  error?: string;
  latencyMs: number;
}

export interface KnowledgeSource {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  url: string | null;
  config: Record<string, unknown>;
  status: string;
  error_message: string | null;
  last_synced_at: Date | null;
  item_count: number;
  total_tokens: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export type KnowledgeSourceType = 'website' | 'document' | 'api' | 'rss' | 'manual';

export interface KnowledgeItem {
  id: string;
  organization_id: string;
  source_id: string | null;
  title: string | null;
  content: string;
  content_type: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  tokens: number;
  chunk_index: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateKnowledgeSourceData {
  name: string;
  type: KnowledgeSourceType;
  url?: string;
  config?: Record<string, unknown>;
}

export interface UpdateKnowledgeSourceData {
  name?: string;
  url?: string;
  config?: Record<string, unknown>;
  status?: string;
}

export interface Competitor {
  id: string;
  organization_id: string;
  name: string;
  url: string | null;
  description: string | null;
  industry: string | null;
  monitoring_config: Record<string, unknown>;
  last_checked_at: Date | null;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CompetitorSnapshot {
  id: string;
  competitor_id: string;
  organization_id: string;
  type: string;
  title: string | null;
  data: Record<string, unknown>;
  summary: string | null;
  snapshot_date: string;
  created_at: Date;
}

export interface CreateCompetitorData {
  name: string;
  url?: string;
  description?: string;
  industry?: string;
  monitoring_config?: Record<string, unknown>;
}

export interface UpdateCompetitorData {
  name?: string;
  url?: string;
  description?: string;
  industry?: string;
  monitoring_config?: Record<string, unknown>;
  status?: string;
}

export interface CreateSnapshotData {
  type: string;
  title?: string;
  data?: Record<string, unknown>;
  summary?: string;
  snapshot_date?: string;
}

export interface TrendMonitor {
  id: string;
  organization_id: string;
  topic: string;
  description: string | null;
  keywords: string[];
  sources: string[];
  config: Record<string, unknown>;
  last_checked_at: Date | null;
  alert_threshold: number;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TrendItem {
  id: string;
  monitor_id: string;
  organization_id: string;
  title: string | null;
  url: string | null;
  source: string | null;
  summary: string | null;
  relevance_score: number;
  sentiment: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  is_saved: boolean;
  published_at: Date | null;
  created_at: Date;
}

export interface CreateTrendMonitorData {
  topic: string;
  description?: string;
  keywords?: string[];
  sources?: string[];
  config?: Record<string, unknown>;
  alert_threshold?: number;
}

export interface UpdateTrendMonitorData {
  topic?: string;
  description?: string;
  keywords?: string[];
  sources?: string[];
  config?: Record<string, unknown>;
  alert_threshold?: number;
  is_active?: boolean;
}

// ─── Content Studio Types ────────────────────────────────────────────────────

export interface ContentItem {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  project_id: string | null;
  title: string;
  body: string | null;
  excerpt: string | null;
  type: ContentType;
  format: string;
  platform: ContentPlatform | null;
  status: ContentStatus;
  workflow_state: string;
  language: string;
  word_count: number;
  reading_time_seconds: number;
  seo_score: number;
  readability_score: number;
  brand_voice_score: number;
  quality_score: number;
  metadata: Record<string, unknown>;
  ai_generated: boolean;
  ai_model: string | null;
  ai_prompt: string | null;
  ai_context: Record<string, unknown>;
  template_id: string | null;
  parent_id: string | null;
  version: number;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  assigned_to: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  id: string;
  content_id: string;
  organization_id: string;
  version: number;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContentTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string;
  type: ContentType;
  platform: ContentPlatform | null;
  template_body: string;
  variables: TemplateVariable[];
  conditional_sections: ConditionalSection[];
  prompt_template: string | null;
  system_prompt: string | null;
  brand_voice_override: Record<string, unknown>;
  default_metadata: Record<string, unknown>;
  is_system: boolean;
  usage_count: number;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'text';
  description: string;
  required: boolean;
  default?: string;
  options?: string[];
}

export interface ConditionalSection {
  condition: string;
  content: string;
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  category: string;
  type: ContentType;
  platform?: ContentPlatform;
  template_body: string;
  variables?: TemplateVariable[];
  prompt_template?: string;
  system_prompt?: string;
  brand_voice_override?: Record<string, unknown>;
  default_metadata?: Record<string, unknown>;
}

export interface CalendarEvent {
  id: string;
  organization_id: string;
  content_id: string | null;
  campaign_id: string | null;
  title: string;
  description: string | null;
  platform: ContentPlatform | null;
  content_type: ContentType | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  publish_config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCalendarEventData {
  content_id?: string;
  campaign_id?: string;
  title: string;
  description?: string;
  platform?: ContentPlatform;
  content_type?: ContentType;
  scheduled_date: string;
  scheduled_time?: string;
  publish_config?: Record<string, unknown>;
}

export interface ContentApproval {
  id: string;
  content_id: string;
  organization_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  assigned_to: string | null;
  comments: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ContentGenerationJob {
  id: string;
  organization_id: string;
  content_id: string | null;
  template_id: string | null;
  type: ContentType;
  platform: ContentPlatform | null;
  status: 'pending' | 'planning' | 'generating' | 'reviewing' | 'completed' | 'failed';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  quality_results: Record<string, unknown>;
  error: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_cents: number;
  latency_ms: number;
  provider_used: string | null;
  model_used: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateContentRequest {
  type: ContentType;
  platform?: ContentPlatform;
  title?: string;
  prompt: string;
  template_id?: string;
  variables?: Record<string, string>;
  campaign_id?: string;
  max_words?: number;
  tone?: string;
  language?: string;
}

export interface ContentQualityCheck {
  id: string;
  content_id: string;
  organization_id: string;
  check_type: 'grammar' | 'readability' | 'seo' | 'brand_voice' | 'duplicate' | 'compliance' | 'cta';
  score: number;
  issues: QualityIssue[];
  suggestions: string[];
  passed: boolean;
  created_at: string;
}

export interface QualityIssue {
  type: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  position?: { start: number; end: number };
}

export interface QualityReport {
  overall_score: number;
  checks: ContentQualityCheck[];
  passed: boolean;
}
