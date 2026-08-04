# Changelog

All notable changes to AmarktAI Marketing are documented in this file.

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
