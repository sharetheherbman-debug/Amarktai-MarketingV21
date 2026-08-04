export interface KnowledgeSource {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  url: string | null;
  config: Record<string, unknown>;
  status: string;
  error_message: string | null;
  last_synced_at: string | null;
  item_count: number;
  total_tokens: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface Competitor {
  id: string;
  organization_id: string;
  name: string;
  url: string | null;
  description: string | null;
  industry: string | null;
  monitoring_config: Record<string, unknown>;
  last_checked_at: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface TrendMonitor {
  id: string;
  organization_id: string;
  topic: string;
  description: string | null;
  keywords: string[];
  sources: string[];
  config: Record<string, unknown>;
  last_checked_at: string | null;
  alert_threshold: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  published_at: string | null;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { total: number };
  error?: { message: string; code: string };
}
