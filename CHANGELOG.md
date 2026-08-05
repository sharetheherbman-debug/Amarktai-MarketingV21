# Changelog

All notable changes to AmarktAI Marketing are documented in this file.

## [0.9.0-marketplace] - 2026-08-05

### Milestone 9: Marketplace, Developer Platform & Extensibility

#### Database
- Added migration `011_marketplace.sql`
- `marketplace_publishers` - Publisher profiles with verification
- `marketplace_items` - Marketplace items (agents, prompts, workflows, plugins, skill packs)
- `marketplace_versions` - Version history for marketplace items
- `marketplace_installations` - Organization installations
- `marketplace_reviews` - Ratings and reviews
- `marketplace_categories` - Item categories (5 seeded)
- `skill_packs` - AI capability bundles
- `oauth_applications` - OAuth2 application registrations
- `oauth_tokens` - OAuth access tokens
- `marketplace_submissions` - Approval workflow

#### Backend
- `marketplace.service.ts` - Full marketplace (publishers, items, installations, reviews, skill packs, admin)
- `developer-portal.service.ts` - OAuth apps, API keys, developer profile, webhook tester, SDK info
- `marketplace.ts` routes - Marketplace API endpoints
- `developer.ts` routes - Developer portal API endpoints

#### Frontend
- Marketplace (`/marketplace`) - Browse, search, filter, install marketplace items
- Developer Portal (`/developer`) - API keys, OAuth apps, SDK documentation

#### Navigation
- Added "Extend" section to sidebar with Marketplace and Developer links

#### Version
- Updated to v0.9.0-marketplace
- 60 frontend pages, 30 API routes, 11 database migrations

---

## [0.8.0-saas-billing] - 2026-08-04

### Milestone 8: SaaS Billing & Platform Operations

#### Backend
- Added `stripe.service.ts` - Full Stripe integration (customers, subscriptions, payment methods, invoices, webhooks, customer portal)
- Added `feature-flags.service.ts` - Feature flag system with plan/org/role/beta targeting
- Added `licensing.service.ts` - License validation, usage enforcement, overage detection, grace periods, auto-suspension
- Added `platform-ops.service.ts` - System health, provider status, queue status, audit logs, tenant management, announcements
- Added `admin.ts` routes - Admin console API endpoints
- Added migration `010_feature_flags.sql` - Feature flags, announcements, API keys, personal access tokens, security policies

#### Frontend
- Admin Console (`/admin/console`) - System health, provider status, feature flags toggle
- Updated sidebar with Console link in Admin section

#### Platform Features
- Stripe billing with mock mode for development
- Feature flags with plan-based, org-based, role-based, and beta targeting
- License validation with usage limits and overage detection
- Grace period management for past-due subscriptions
- Automatic organization suspension and reactivation
- Platform announcements system
- API keys and personal access tokens (schema ready)

#### Version
- Updated to v0.8.0-saas-billing
- 58 frontend pages, 28 API routes, 10 database migrations

---

## [0.7.0-agency-platform] - 2026-08-04

### Milestone 7A: Agency Platform Complete

#### Backend
- Added `client-reports.service.ts` - Full CRUD for client reports with stats
- Added `client-reports.ts` routes - REST API for report management
- Registered `/api/v1/client-reports` route in server.ts

#### Frontend (6 new pages)
- Agency Dashboard (`/agency`) - Overview with stats, client health, quick actions
- Client Management (`/agency/clients`) - Client list, add, remove with search
- White Label Settings (`/agency/white-label`) - Branding, colors, domains, advanced
- Client Portals (`/agency/portal`) - Portal management with subdomain support
- Template Library (`/agency/templates`) - Browse, search, filter, duplicate, delete
- Client Reports (`/agency/reports`) - Create, send, delete with stats

#### Navigation
- Added "Agency" section to sidebar with 6 links
- All pages connected to API endpoints

#### Version
- Created `version.json` with v0.7.0-agency-platform
- 57 frontend pages total
- 27 API routes total
- 96 database tables total

---

## [0.6.0-integrations] - 2026-08-04

### Milestone 6: Integrations & Omnichannel Automation
- Added `client_portals` table for white-labeled client portals
- Added `white_label_configs` table for branding configurations
- Added `custom_domains` table for domain mapping
- Added `agency_team_members` table for team management
- Added `agency_client_assignments` table for client assignments
- Added `client_reports` table for client reporting
- Added `portal_access_logs` table for audit trail
- Added `template_library` table for reusable templates

#### Backend Services
- `agency.service.ts` - Multi-client management, team management, client assignments, agency stats
- `white-label.service.ts` - White label config, custom domains, client portals, access logging
- `template-library.service.ts` - Reusable templates with categories, system templates seeding

#### API Routes
- `/api/v1/agency` - Agency CRUD, team management, client assignments, stats, health
- `/api/v1/white-label/config` - White label configuration
- `/api/v1/white-label/domains` - Custom domain management
- `/api/v1/white-label/portals` - Client portal management
- `/api/v1/template-library` - Template CRUD, categories, duplication

#### Features
- **Multi-Client Management**: Agency dashboard, client workspaces, team assignments
- **White Label**: Custom branding, logos, colors, fonts, CSS, email branding
- **Custom Domains**: Domain mapping with SSL status tracking
- **Client Portals**: White-labeled portals for client collaboration
- **Template Library**: Reusable templates for campaigns, workflows, prompts, brand DNA, SEO, CRM, onboarding
- **Agency Analytics**: Revenue overview, client health, team utilization
- **Expanded RBAC**: Agency Owner, Admin, Manager, Member, Viewer roles

#### Documentation
- Agency Guide added (docs/AGENCY_GUIDE.md)

---

## [0.6.0-integrations] - 2026-08-04

### Milestone 6: Integrations & Omnichannel Automation

#### Database
- Added `integration_providers` table with 21 seeded providers
- Added `integration_connections` table for user-configured connections
- Added `integration_sync_logs` table for audit trail
- Added `webhooks_incoming` and `webhooks_outgoing` tables
- Added `webhook_deliveries` table for delivery tracking
- Added `analytics_google` and `analytics_search_console` tables
- Added `email_providers` table for email provider configurations
- Added `import_export_jobs` table for job tracking

#### Backend Services
- `integration.service.ts` - Complete integration framework with providers, connections, webhooks, email, import/export

#### API Routes
- `/api/v1/integrations/providers` - List available integration providers
- `/api/v1/integrations/connections` - CRUD for integration connections
- `/api/v1/integrations/connections/:id/test` - Connection testing
- `/api/v1/integrations/health` - Health check all connections
- `/api/v1/integrations/logs` - Sync log retrieval
- `/api/v1/integrations/webhooks/incoming` - Incoming webhook management
- `/api/v1/integrations/webhooks/outgoing` - Outgoing webhook management
- `/api/v1/integrations/webhooks/deliveries` - Webhook delivery history
- `/api/v1/integrations/email-providers` - Email provider management
- `/api/v1/integrations/import-export` - Import/export job management

#### Supported Providers (21)
- CMS: WordPress, Webflow, Ghost
- Social: Facebook, Instagram, LinkedIn, X, YouTube, Pinterest
- Analytics: Google Analytics 4, Google Search Console, Google Business Profile
- Calendar: Google Calendar, Outlook Calendar
- Email: SMTP, Gmail, Microsoft 365, Mailgun, SendGrid, Amazon SES
- Storage: Google Drive

#### Frontend
- Integrations dashboard with provider browser
- Webhook management (incoming/outgoing)
- Import/Export job management

#### Documentation
- Integration Guide added (docs/INTEGRATION_GUIDE.md)

---

## [0.5.0-crm] - 2026-08-04

### Milestone 7: CRM Integration

- Contact management with CRUD operations
- Lead scoring system
- Customer segmentation
- Email marketing integration
- Pipeline management
- Activity tracking

---

## [0.4.0-seo-social] - 2026-08-04

### Milestones 4-5: SEO Engine & Social Publishing

#### SEO Engine (Milestone 4)
- SEO analysis tool
- Keyword research functionality
- On-page SEO recommendations
- Meta tag optimization
- Content readability scoring
- Competitor SEO comparison
- SERP tracking

#### Social Publishing (Milestone 5)
- Social media account connections
- Multi-platform publishing
- Post scheduling
- Engagement tracking
- Hashtag suggestions
- Best time to post analysis
- Social media calendar

---

## [0.3.0-content-studio] - 2026-08-04

### Milestone 3: Content Studio

- AI content generation engine
- Blog post generator
- Social media post creator
- Email campaign writer
- Ad copy generator
- Content templates
- Content scheduling
- Content calendar

---

## [0.3.0-research] - 2026-08-04

### Milestone 2: Research & Knowledge

#### Database
- Added `knowledge_sources` table for content source management
- Added `knowledge_items` table for chunked knowledge content with pgvector embeddings
- Added `competitors` table for competitor tracking
- Added `competitor_snapshots` table for point-in-time competitor data
- Added `trend_monitoring` table for trend monitor configurations
- Added `trend_items` table for individual trend entries

#### Backend Services
- `knowledge.service.ts` - CRUD for knowledge sources and items, search, sync
- `crawler.service.ts` - Website crawling, HTML parsing, text chunking, PDF parsing
- `competitor.service.ts` - Competitor tracking, website checks, change detection
- `trend.service.ts` - Trend monitoring, alert management, item tracking
- `vector.service.ts` - Embedding generation, similarity search via pgvector

#### API Routes
- `/api/v1/knowledge` - Knowledge sources, items, search, sync, stats
- `/api/v1/competitors` - Competitor CRUD, checks, snapshots, recent changes
- `/api/v1/trends` - Trend monitors, items, alerts, read/save

#### Frontend
- Knowledge Base page - List, create, sync, delete knowledge sources
- Competitor Monitoring page - Track competitors, run checks, view changes
- Trend Monitoring page - Monitors, alerts, items with read/save
- Sidebar navigation updated with Research section

#### Documentation
- API.md updated with Knowledge, Competitor, Trend endpoints
- DATABASE.md updated with M2 table schemas
- ARCHITECTURE.md updated with M2 services and routes

---

## [0.2.0-ai-core] - 2026-08-04

### Milestone 1: AI Core

#### Database
- Added `agent_definitions` table for agent registry
- Added `prompt_library` table with versioning
- Added `prompt_versions` table for rollback support
- Added `brand_dna` table for brand identity
- Added `tool_registry` table for tool management
- Added `agent_conversations` table for multi-turn context
- Added `prompt_test_results` table for prompt testing

#### Backend Services
- `agent-orchestrator.service.ts` - Agent execution and orchestration
- `task-planner.service.ts` - Task planning and decomposition
- `context-engine.service.ts` - Context assembly for AI operations
- `prompt.service.ts` - Prompt management with versioning
- `brand-dna.service.ts` - Brand DNA CRUD and retrieval
- `tool.service.ts` - Tool registry and execution

#### AI Providers
- Provider Router with automatic failover
- GenX Router integration
- Together AI integration
- DeepInfra integration

#### Memory Architecture
- `memory.service.ts` - Key-value memory store
- `business.memory.ts` - Business context memory
- `conversation.memory.ts` - Conversation history memory

---

## [0.1.0-foundation] - 2026-08-04

### Phase 1: Foundation

#### Monorepo
- Turborepo workspace configuration
- Shared UI component library (`packages/ui/`)
- Docker Compose with PostgreSQL, Redis, API, Web, Nginx

#### Backend
- Express + TypeScript server
- Authentication (JWT, bcrypt, refresh tokens)
- Authorization (RBAC with org-scoped roles)
- Rate limiting, CORS, CSRF protection
- Request validation with Zod
- PostgreSQL with 3 initial tables (users, organizations, campaigns, etc.)

#### Frontend
- Next.js 15 with App Router
- Marketing pages (home, about, features, pricing)
- Auth pages (login, register, forgot-password, reset-password)
- Dashboard with sidebar navigation
- 35 static pages generated

#### Infrastructure
- Multi-stage Dockerfiles for API and Web
- Nginx reverse proxy configuration
- Health checks on all services
