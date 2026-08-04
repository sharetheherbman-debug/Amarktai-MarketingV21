# Database Documentation

Complete database schema and management guide for AmarktAI Marketing.

## Overview

AmarktAI Marketing uses PostgreSQL 16 as the primary database. The schema is designed for multi-tenant SaaS operations with organization-scoped data isolation.

## Connection

```
postgresql://amarktai:amarktai_secure_password@localhost:5432/amarktai_marketing
```

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

## Tables

### users

Stores user accounts and authentication data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key, auto-generated |
| `email` | VARCHAR(255) UNIQUE | Email address |
| `password_hash` | VARCHAR(255) | Bcrypt password hash |
| `name` | VARCHAR(255) | Display name |
| `avatar` | TEXT | Avatar URL |
| `role` | VARCHAR(50) | `user`, `admin`, `superadmin` |
| `email_verified` | BOOLEAN | Email verification status |
| `email_verification_token` | VARCHAR(255) | Verification token |
| `reset_token` | VARCHAR(255) | Password reset token |
| `reset_token_expires` | TIMESTAMP | Reset token expiry |
| `two_factor_secret` | VARCHAR(255) | 2FA secret (reserved) |
| `two_factor_enabled` | BOOLEAN | 2FA status (reserved) |
| `last_login_at` | TIMESTAMP | Last login timestamp |
| `settings` | JSONB | User preferences |
| `status` | VARCHAR(50) | `active`, `inactive`, `suspended` |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_users_email`, `idx_users_status`

### organizations

Stores organization/company data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `name` | VARCHAR(255) | Organization name |
| `slug` | VARCHAR(255) UNIQUE | URL-friendly identifier |
| `logo` | TEXT | Logo URL |
| `settings` | JSONB | Organization settings |
| `plan` | VARCHAR(50) | `free`, `starter`, `professional`, `enterprise` |
| `status` | VARCHAR(50) | `active`, `inactive`, `suspended` |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

### organization_members

Many-to-many relationship between users and organizations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `user_id` | UUID FK | References users(id) CASCADE |
| `role` | VARCHAR(50) | `owner`, `admin`, `member`, `viewer` |
| `invited_by` | UUID FK | References users(id) |
| `joined_at` | TIMESTAMP | Join timestamp |

Unique constraint: `(organization_id, user_id)`. Indexes: `idx_org_members_org`, `idx_org_members_user`

### projects

Organizational units for grouping campaigns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(255) | Project name |
| `description` | TEXT | Project description |
| `settings` | JSONB | Project settings |
| `status` | VARCHAR(50) | `active`, `archived` |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_projects_org`

### campaigns

Marketing campaigns with scheduling and metrics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `project_id` | UUID FK | References projects(id) SET NULL |
| `name` | VARCHAR(255) | Campaign name |
| `description` | TEXT | Campaign description |
| `type` | VARCHAR(50) | `email`, `social`, `ads`, `content`, `sms` |
| `status` | VARCHAR(50) | `draft`, `scheduled`, `active`, `paused`, `completed`, `archived` |
| `config` | JSONB | Campaign configuration |
| `schedule` | JSONB | Scheduling rules |
| `metrics` | JSONB | Performance metrics |
| `created_by` | UUID FK | References users(id) |
| `started_at` | TIMESTAMP | Start timestamp |
| `completed_at` | TIMESTAMP | Completion timestamp |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_campaigns_org`, `idx_campaigns_project`, `idx_campaigns_status`

### content

Marketing content (blog posts, social media, emails, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `campaign_id` | UUID FK | References campaigns(id) SET NULL |
| `project_id` | UUID FK | References projects(id) SET NULL |
| `title` | VARCHAR(500) | Content title |
| `body` | TEXT | Content body |
| `type` | VARCHAR(50) | `blog`, `social`, `email`, `ad`, `video`, `image` |
| `format` | VARCHAR(50) | `markdown`, `html`, `plain` |
| `platform` | VARCHAR(50) | Target platform |
| `status` | VARCHAR(50) | `draft`, `review`, `approved`, `published`, `archived` |
| `metadata` | JSONB | Additional metadata |
| `ai_generated` | BOOLEAN | Whether AI-generated |
| `ai_model` | VARCHAR(100) | AI model used |
| `ai_prompt` | TEXT | Generation prompt |
| `published_at` | TIMESTAMP | Publication timestamp |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_content_org`, `idx_content_campaign`, `idx_content_type`, `idx_content_status`

### agents

AI agents for automated marketing tasks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(255) | Agent name |
| `description` | TEXT | Agent description |
| `type` | VARCHAR(50) | `content`, `analytics`, `social`, `email`, `research`, `custom` |
| `config` | JSONB | Agent configuration |
| `system_prompt` | TEXT | System prompt for AI |
| `model` | VARCHAR(100) | AI model to use |
| `provider` | VARCHAR(50) | AI provider to use |
| `status` | VARCHAR(50) | `active`, `inactive`, `training` |
| `capabilities` | JSONB | List of capabilities |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_agents_org`, `idx_agents_type`

### tasks

Agent execution tasks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `agent_id` | UUID FK | References agents(id) SET NULL |
| `campaign_id` | UUID FK | References campaigns(id) SET NULL |
| `name` | VARCHAR(255) | Task name |
| `type` | VARCHAR(50) | Task type |
| `status` | VARCHAR(50) | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `input` | JSONB | Task input data |
| `output` | JSONB | Task output data |
| `error` | TEXT | Error message if failed |
| `started_at` | TIMESTAMP | Start timestamp |
| `completed_at` | TIMESTAMP | Completion timestamp |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

Indexes: `idx_tasks_org`, `idx_tasks_agent`, `idx_tasks_status`

### ai_providers

AI provider configurations (global or organization-scoped).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE (null = global) |
| `name` | VARCHAR(100) | Provider name |
| `type` | VARCHAR(50) | `genx`, `together`, `deepinfra`, `openai`, `custom` |
| `api_key_encrypted` | TEXT | Encrypted API key |
| `base_url` | VARCHAR(500) | API base URL |
| `config` | JSONB | Provider configuration |
| `models` | JSONB | Available models |
| `enabled` | BOOLEAN | Whether provider is enabled |
| `priority` | INTEGER | Routing priority (higher = preferred) |
| `health_status` | VARCHAR(50) | `healthy`, `degraded`, `unhealthy`, `unknown` |
| `last_health_check` | TIMESTAMP | Last health check timestamp |
| `usage_stats` | JSONB | Usage statistics |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

Indexes: `idx_ai_providers_org`, `idx_ai_providers_type`

### memory

Key-value memory store for AI context.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `key` | VARCHAR(255) | Memory key |
| `value` | JSONB | Memory value |
| `type` | VARCHAR(50) | `business`, `brand`, `conversation`, `knowledge`, `preference` |
| `namespace` | VARCHAR(100) | Optional namespace for grouping |
| `metadata` | JSONB | Additional metadata |
| `expires_at` | TIMESTAMP | Optional expiration |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

Unique constraint: `(organization_id, key, namespace)`. Indexes: `idx_memory_org`, `idx_memory_key`, `idx_memory_type`, `idx_memory_namespace`

### analytics

Event tracking for analytics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `event_type` | VARCHAR(100) | Event type |
| `entity_type` | VARCHAR(50) | Related entity type |
| `entity_id` | UUID | Related entity ID |
| `data` | JSONB | Event data |
| `created_at` | TIMESTAMP | Event timestamp |

Indexes: `idx_analytics_org`, `idx_analytics_event`, `idx_analytics_created`

### media

Uploaded media files.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(255) | File name |
| `type` | VARCHAR(50) | File type |
| `url` | TEXT | File URL |
| `size` | INTEGER | File size in bytes |
| `mime_type` | VARCHAR(100) | MIME type |
| `metadata` | JSONB | Additional metadata |
| `uploaded_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Upload timestamp |

Indexes: `idx_media_org`

### notifications

User notifications.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK | References users(id) CASCADE |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `type` | VARCHAR(50) | Notification type |
| `title` | VARCHAR(255) | Notification title |
| `message` | TEXT | Notification message |
| `data` | JSONB | Additional data |
| `read` | BOOLEAN | Read status |
| `created_at` | TIMESTAMP | Creation timestamp |

Indexes: `idx_notifications_user`, `idx_notifications_read`

### audit_logs

Audit trail for security and compliance.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `user_id` | UUID FK | References users(id) SET NULL |
| `action` | VARCHAR(100) | Action performed |
| `entity_type` | VARCHAR(50) | Entity type |
| `entity_id` | UUID | Entity ID |
| `old_value` | JSONB | Previous value |
| `new_value` | JSONB | New value |
| `ip_address` | VARCHAR(45) | Client IP address |
| `user_agent` | TEXT | Client user agent |
| `created_at` | TIMESTAMP | Action timestamp |

Indexes: `idx_audit_logs_org`, `idx_audit_logs_user`, `idx_audit_logs_action`, `idx_audit_logs_created`

### invitations

Organization invitations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `email` | VARCHAR(255) | Invitee email |
| `role` | VARCHAR(50) | Invited role |
| `token` | VARCHAR(255) UNIQUE | Unique invitation token |
| `invited_by` | UUID FK | References users(id) |
| `accepted` | BOOLEAN | Acceptance status |
| `expires_at` | TIMESTAMP | Expiration timestamp |
| `created_at` | TIMESTAMP | Creation timestamp |

Indexes: `idx_invitations_token`, `idx_invitations_email`

### workflows

Automation workflows.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(255) | Workflow name |
| `description` | TEXT | Workflow description |
| `trigger_type` | VARCHAR(50) | Trigger type |
| `trigger_config` | JSONB | Trigger configuration |
| `steps` | JSONB | Workflow steps array |
| `status` | VARCHAR(50) | `draft`, `active`, `paused`, `archived` |
| `last_run_at` | TIMESTAMP | Last execution timestamp |
| `run_count` | INTEGER | Execution count |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

### plugins

Installed plugins.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(100) | Plugin name |
| `type` | VARCHAR(50) | Plugin type |
| `config` | JSONB | Plugin configuration |
| `enabled` | BOOLEAN | Whether plugin is enabled |
| `status` | VARCHAR(50) | `active`, `inactive` |
| `last_sync_at` | TIMESTAMP | Last sync timestamp |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### refresh_tokens

JWT refresh token storage.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK | References users(id) CASCADE |
| `token_hash` | VARCHAR(255) | Token hash |
| `expires_at` | TIMESTAMP | Expiration timestamp |
| `revoked` | BOOLEAN | Revocation status |
| `created_at` | TIMESTAMP | Creation timestamp |

Indexes: `idx_refresh_tokens_user`, `idx_refresh_tokens_hash`

### knowledge_sources

Knowledge content sources (websites, documents, APIs).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(255) | Source name |
| `type` | VARCHAR(50) | `website`, `document`, `api`, `manual` |
| `url` | TEXT | Source URL |
| `config` | JSONB | Crawl/import configuration |
| `status` | VARCHAR(50) | `pending`, `crawling`, `completed`, `failed` |
| `error_message` | TEXT | Last error message |
| `last_synced_at` | TIMESTAMP | Last sync timestamp |
| `item_count` | INTEGER | Number of knowledge items |
| `total_tokens` | INTEGER | Total token count |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_knowledge_sources_org`, `idx_knowledge_sources_type`, `idx_knowledge_sources_status`

### knowledge_items

Individual knowledge chunks from sources.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `source_id` | UUID FK | References knowledge_sources(id) CASCADE |
| `title` | VARCHAR(500) | Item title |
| `content` | TEXT | Content text |
| `content_type` | VARCHAR(50) | `page`, `section`, `faq`, `product` |
| `url` | TEXT | Source URL |
| `metadata` | JSONB | Additional metadata |
| `embedding` | VECTOR(1536) | pgvector embedding |
| `tokens` | INTEGER | Token count |
| `chunk_index` | INTEGER | Chunk order index |
| `parent_id` | UUID FK | References knowledge_items(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

Indexes: `idx_knowledge_items_org`, `idx_knowledge_items_source`, `idx_knowledge_items_type`, `idx_knowledge_items_tokens`

### competitors

Tracked competitor companies.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `name` | VARCHAR(255) | Competitor name |
| `url` | TEXT | Website URL |
| `description` | TEXT | Description |
| `industry` | VARCHAR(100) | Industry category |
| `monitoring_config` | JSONB | What to monitor |
| `last_checked_at` | TIMESTAMP | Last check timestamp |
| `status` | VARCHAR(50) | `active`, `paused`, `archived` |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

Indexes: `idx_competitors_org`, `idx_competitors_status`

### competitor_snapshots

Point-in-time competitor website data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `competitor_id` | UUID FK | References competitors(id) CASCADE |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `type` | VARCHAR(50) | `pricing`, `content`, `social`, `seo` |
| `title` | VARCHAR(500) | Snapshot title |
| `data` | JSONB | Captured data |
| `summary` | TEXT | Change summary |
| `snapshot_date` | DATE | Snapshot date |
| `created_at` | TIMESTAMP | Creation timestamp |

Indexes: `idx_competitor_snapshots_competitor`, `idx_competitor_snapshots_type`, `idx_competitor_snapshots_date`

### trend_monitoring

Trend monitoring configurations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `topic` | VARCHAR(255) | Trend topic |
| `description` | TEXT | Description |
| `keywords` | JSONB | Search keywords array |
| `sources` | JSONB | Source URLs array |
| `config` | JSONB | Monitor configuration |
| `last_checked_at` | TIMESTAMP | Last check timestamp |
| `alert_threshold` | FLOAT | Relevance threshold (0-1) |
| `is_active` | BOOLEAN | Whether active |
| `created_by` | UUID FK | References users(id) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

Indexes: `idx_trend_monitoring_org`, `idx_trend_monitoring_active`

### trend_items

Individual trend entries found by monitors.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `monitor_id` | UUID FK | References trend_monitoring(id) CASCADE |
| `organization_id` | UUID FK | References organizations(id) CASCADE |
| `title` | VARCHAR(500) | Item title |
| `url` | TEXT | Source URL |
| `source` | VARCHAR(255) | Source name |
| `summary` | TEXT | Content summary |
| `relevance_score` | FLOAT | Relevance score (0-1) |
| `sentiment` | VARCHAR(50) | `positive`, `negative`, `neutral`, `mixed` |
| `data` | JSONB | Additional data |
| `is_read` | BOOLEAN | Read status |
| `is_saved` | BOOLEAN | Saved status |
| `published_at` | TIMESTAMP | Publication timestamp |
| `created_at` | TIMESTAMP | Creation timestamp |

Indexes: `idx_trend_items_monitor`, `idx_trend_items_org`, `idx_trend_items_relevance`, `idx_trend_items_created`

### system_settings

Global system configuration.

| Column | Type | Description |
|--------|------|-------------|
| `key` | VARCHAR(255) PK | Setting key |
| `value` | JSONB | Setting value |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `updated_by` | UUID FK | References users(id) |

## Key Relationships

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| organization_members | organization_id | organizations.id | CASCADE |
| organization_members | user_id | users.id | CASCADE |
| organization_members | invited_by | users.id | - |
| projects | organization_id | organizations.id | CASCADE |
| projects | created_by | users.id | - |
| campaigns | organization_id | organizations.id | CASCADE |
| campaigns | project_id | projects.id | SET NULL |
| campaigns | created_by | users.id | - |
| content | organization_id | organizations.id | CASCADE |
| content | campaign_id | campaigns.id | SET NULL |
| content | project_id | projects.id | SET NULL |
| content | created_by | users.id | - |
| agents | organization_id | organizations.id | CASCADE |
| agents | created_by | users.id | - |
| tasks | organization_id | organizations.id | CASCADE |
| tasks | agent_id | agents.id | SET NULL |
| tasks | campaign_id | campaigns.id | SET NULL |
| tasks | created_by | users.id | - |
| ai_providers | organization_id | organizations.id | CASCADE |
| memory | organization_id | organizations.id | CASCADE |
| analytics | organization_id | organizations.id | CASCADE |
| media | organization_id | organizations.id | CASCADE |
| media | uploaded_by | users.id | - |
| notifications | user_id | users.id | CASCADE |
| notifications | organization_id | organizations.id | CASCADE |
| audit_logs | organization_id | organizations.id | CASCADE |
| audit_logs | user_id | users.id | SET NULL |
| invitations | organization_id | organizations.id | CASCADE |
| invitations | invited_by | users.id | - |
| workflows | organization_id | organizations.id | CASCADE |
| workflows | created_by | users.id | - |
| plugins | organization_id | organizations.id | CASCADE |
| refresh_tokens | user_id | users.id | CASCADE |
| system_settings | updated_by | users.id | - |

## Migrations

### Running Migrations

```bash
npm run db:migrate
```

Or directly:

```bash
cd apps/api
npm run build
node dist/db/migrate.js
```

### Migration Files

Migrations are stored in `apps/api/src/db/migrations/` and executed in sequential order:

```
apps/api/src/db/migrations/
├── 001_initial.sql
├── 002_ai_core.sql
└── 003_knowledge.sql
```

### Creating New Migrations

1. Create a new SQL file in the migrations directory
2. Use sequential numbering: `002_add_feature.sql`
3. Write your SQL statements
4. Run migrations

```sql
-- Example: 002_add_tags.sql
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE INDEX idx_tags_org ON tags(organization_id);
```

## Seed Data

### Running Seeds

```bash
npm run db:seed
```

### Default Seed Data

The initial seed creates:
- Default system settings
- Sample AI provider configurations (optional)

## Backup and Restore

### Backup

```bash
pg_dump -U amarktai -d amarktai_marketing > backup.sql
pg_dump -U amarktai -d amarktai_marketing | gzip > backup.sql.gz
```

### Restore

```bash
psql -U amarktai -d amarktai_marketing < backup.sql
gunzip -c backup.sql.gz | psql -U amarktai -d amarktai_marketing
```

### Docker Backup

```bash
docker exec amarktai-postgres pg_dump -U amarktai amarktai_marketing > backup.sql
cat backup.sql | docker exec -i amarktai-postgres psql -U amarktai amarktai_marketing
```
