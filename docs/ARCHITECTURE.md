# Architecture

This document describes the system architecture of AmarktAI Marketing, an autonomous AI marketing platform.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Internet                                       │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Nginx Reverse Proxy                               │
│                        (Ports 80/443 - SSL Termination)                     │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ Static Assets    │  │ API Proxy       │  │ WebSocket Proxy            │ │
│  │ Cache (1 year)   │  │ /api/*          │  │ /ws/*                      │ │
│  └─────────────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
└─────────────────────────────────┼─────────────────────────┼─────────────────┘
                                  │                         │
                    ┌─────────────┴─────────────┐           │
                    │                           │           │
                    ▼                           ▼           ▼
┌─────────────────────────────┐   ┌─────────────────────────────────────────┐
│     Next.js Frontend        │   │           Express API                   │
│     (Port 3000)             │   │           (Port 4000)                   │
│                             │   │                                         │
│  ┌───────────────────────┐  │   │  ┌──────────────────────────────────┐  │
│  │    App Router          │  │   │  │         Middleware Layer          │  │
│  │                        │  │   │  │                                  │  │
│  │  (auth)/               │  │   │  │  - CORS (helmet)                 │  │
│  │    - login             │  │   │  │  - Rate Limiting                 │  │
│  │    - register          │  │   │  │  - JWT Authentication            │  │
│  │    - forgot-password   │  │   │  │  - Request Validation (Zod)      │  │
│  │    - verify-email      │  │   │  │  - Error Handling                │  │
│  │                        │  │   │  │  - RBAC Authorization            │  │
│  │  (dashboard)/          │  │   │  └──────────────┬───────────────────┘  │
│  │    - dashboard         │  │   │                 │                       │
│  │    - campaigns         │  │   │  ┌──────────────▼───────────────────┐  │
│  │    - content           │  │   │  │         Route Layer              │  │
│  │    - agents            │  │   │  │                                  │  │
│  │    - analytics         │  │   │  │  /api/v1/health                  │  │
│  │    - settings          │  │   │  │  /api/v1/auth/*                  │  │
│  │                        │  │   │  │  /api/v1/organizations/*         │  │
│  │  onboarding/           │  │   │  │  /api/v1/users/*                 │  │
│  │    - wizard            │  │   │  │  /api/v1/providers/*             │  │
│  └───────────────────────┘  │   │  │  /api/v1/campaigns/*             │  │
│                             │   │  │  /api/v1/content/*               │  │
│  ┌───────────────────────┐  │   │  │  /api/v1/agents/*                │  │
│  │    State Management   │  │   │  │  /api/v1/onboarding/*            │  │
│  │    (Zustand)          │  │   │  └──────────────┬───────────────────┘  │
│  └───────────────────────┘  │   │                 │                       │
└─────────────────────────────┘   │  ┌──────────────▼───────────────────┐  │
                                  │  │       Service Layer              │  │
                                  │  │                                  │  │
                                  │  │  - AuthService                   │  │
                                  │  │  - OrganizationService           │  │
                                  │  │  - ProviderService               │  │
                                  │  │  - OnboardingService             │  │
                                  │  │  - MemoryService                 │  │
                                  │  └──────────────┬───────────────────┘  │
                                  │                 │                       │
                                  │  ┌──────────────▼───────────────────┐  │
                                  │  │     Data Access Layer            │  │
                                  │  │                                  │  │
                                  │  │  - PostgreSQL (pg driver)        │  │
                                  │  │  - Redis (ioredis)               │  │
                                  │  │  - BullMQ (job queues)           │  │
                                  │  └──────────────────────────────────┘  │
                                  └─────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
        ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
        │   PostgreSQL 16   │     │    Redis 7       │     │   AI Providers   │
        │                    │     │                  │     │                  │
        │  - Users           │     │  - Sessions      │     │  - GenX Router   │
        │  - Organizations   │     │  - Job Queues    │     │  - Together AI   │
        │  - Campaigns       │     │  - Rate Limiting │     │  - DeepInfra     │
        │  - Content         │     │  - Caching       │     │                  │
        │  - Agents          │     └──────────────────┘     └──────────────────┘
        │  - Memory          │
        │  - Analytics       │
        │  - Audit Logs      │
        └──────────────────┘
```

## Monorepo Structure

The project uses a monorepo architecture with Turborepo for build orchestration.

```
amarktai-marketing/
├── apps/
│   ├── api/                    # Backend API (Express + TypeScript)
│   └── web/                    # Frontend (Next.js 15)
├── packages/
│   └── ui/                     # Shared UI components
├── docker/                     # Docker configurations
├── docs/                       # Documentation
├── turbo.json                  # Turborepo config
└── package.json                # Root workspace config
```

### Workspace Configuration

```json
// package.json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

### Build Pipeline

Turborepo manages the build pipeline with dependency-aware task execution:

```json
// turbo.json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "db:migrate": { "cache": false },
    "db:seed": { "cache": false }
  }
}
```

## Frontend Architecture

### Next.js App Router

The frontend uses Next.js 15 with the App Router for file-based routing and React Server Components.

```
apps/web/app/
├── (auth)/                     # Auth route group (shared layout)
│   ├── layout.tsx              # Auth layout (centered card)
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   ├── reset-password/page.tsx
│   ├── verify-email/page.tsx
│   └── invite/page.tsx
│
├── (dashboard)/                # Dashboard route group (sidebar layout)
│   ├── layout.tsx              # Dashboard layout with navigation
│   ├── dashboard/page.tsx      # Overview dashboard
│   ├── campaigns/page.tsx      # Campaign management
│   ├── content/page.tsx        # Content management
│   ├── agents/page.tsx         # AI agent management
│   ├── analytics/page.tsx      # Analytics dashboard
│   ├── settings/page.tsx       # User settings
│   └── admin/page.tsx          # Admin panel
│
├── (marketing)/                # Public marketing pages
│   └── page.tsx
│
├── onboarding/page.tsx         # Setup wizard
├── maintenance/page.tsx        # Maintenance page
├── layout.tsx                  # Root layout
├── error.tsx                   # Global error boundary
├── not-found.tsx               # 404 page
└── globals.css                 # Global styles
```

### Route Groups

- **(auth)**: Unauthenticated pages with centered card layout
- **(dashboard)**: Authenticated pages with sidebar navigation
- **(marketing)**: Public pages with marketing layout

### State Management

Zustand is used for client-side state management:

```typescript
// Example store structure
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}
```

### Component Architecture

```
src/
├── components/
│   ├── ui/                     # Primitive UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── ...
│   ├── layout/                 # Layout components
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Navigation.tsx
│   ├── forms/                  # Form components
│   │   ├── LoginForm.tsx
│   │   ├── CampaignForm.tsx
│   │   └── ...
│   └── features/               # Feature-specific components
│       ├── campaigns/
│       ├── content/
│       └── agents/
├── hooks/                      # Custom React hooks
├── lib/                        # Utility libraries
│   ├── api.ts                  # API client
│   ├── auth.ts                 # Auth utilities
│   └── utils.ts                # General utilities
└── types/                      # TypeScript types
```

## Backend Architecture

### Express API

The backend follows a layered architecture pattern:

```
Request Flow:
Client → Middleware → Route → Service → Repository → Database
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **Middleware** | Cross-cutting concerns (auth, validation, rate limiting) |
| **Routes** | HTTP endpoint definitions and request/response handling |
| **Services** | Business logic and orchestration |
| **Repository** | Data access and query building |
| **Config** | Database, Redis, and environment configuration |

### Middleware Pipeline

```typescript
// Request processing order
app.use(cors());              // CORS headers
app.use(helmet());            // Security headers
app.use(compression());       // Response compression
app.use(morgan());            // Request logging
app.use(cookieParser());      // Cookie parsing
app.use(express.json());      // JSON body parsing
app.use(rateLimiter);         // Rate limiting
// Routes...
app.use(errorHandler);        // Error handling
```

### Service Layer

Services encapsulate business logic and are independent of HTTP:

```typescript
// Example: auth.service.ts
export async function register(data: RegisterData): Promise<{ user: User; tokens: TokenPair }> {
  // 1. Check if user exists
  // 2. Hash password
  // 3. Create user
  // 4. Generate tokens
  // 5. Store refresh token
  return { user, tokens };
}
```

### Route Layer

Routes handle HTTP-specific concerns:

```typescript
// Example: auth.ts
router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { user, tokens } = await authService.register(req.body);
    res.cookie('accessToken', tokens.accessToken, cookieOptions);
    res.status(201).json({ success: true, data: { user, accessToken: tokens.accessToken } });
  } catch (error) {
    next(error);
  }
});
```

## Database

### PostgreSQL Schema

The database uses PostgreSQL 16 with the following schema:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Core Tables                             │
├─────────────────────────────────────────────────────────────────┤
│  users                    │  organizations                      │
│  ├── id (UUID PK)         │  ├── id (UUID PK)                   │
│  ├── email (UNIQUE)       │  ├── name                           │
│  ├── password_hash        │  ├── slug (UNIQUE)                  │
│  ├── name                 │  ├── plan                           │
│  ├── role                 │  └── status                         │
│  └── status               │                                     │
│                           │  organization_members               │
│                           │  ├── organization_id (FK)           │
│                           │  ├── user_id (FK)                   │
│                           │  └── role                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Marketing Tables                           │
├─────────────────────────────────────────────────────────────────┤
│  projects                 │  campaigns                          │
│  ├── id (UUID PK)         │  ├── id (UUID PK)                   │
│  ├── organization_id (FK) │  ├── organization_id (FK)           │
│  ├── name                 │  ├── project_id (FK)                │
│  └── status               │  ├── name                           │
│                           │  ├── type                           │
│                           │  └── status                         │
│                           │                                     │
│  content                  │  agents                             │
│  ├── id (UUID PK)         │  ├── id (UUID PK)                   │
│  ├── organization_id (FK) │  ├── organization_id (FK)           │
│  ├── campaign_id (FK)     │  ├── name                           │
│  ├── title                │  ├── type                           │
│  ├── body                 │  ├── model                          │
│  ├── type                 │  └── status                         │
│  └── status               │                                     │
│                           │  tasks                              │
│                           │  ├── id (UUID PK)                   │
│                           │  ├── organization_id (FK)           │
│                           │  ├── agent_id (FK)                  │
│                           │  ├── campaign_id (FK)               │
│                           │  └── status                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      System Tables                              │
├─────────────────────────────────────────────────────────────────┤
│  ai_providers             │  memory                             │
│  ├── id (UUID PK)         │  ├── id (UUID PK)                   │
│  ├── organization_id (FK) │  ├── organization_id (FK)           │
│  ├── name                 │  ├── key                            │
│  ├── type                 │  ├── value (JSONB)                  │
│  ├── api_key_encrypted    │  ├── type                           │
│  ├── base_url             │  └── namespace                      │
│  ├── enabled              │                                     │
│  └── priority             │  analytics                          │
│                           │  ├── id (UUID PK)                   │
│  workflows                │  ├── organization_id (FK)           │
│  ├── id (UUID PK)         │  ├── event_type                     │
│  ├── organization_id (FK) │  └── data (JSONB)                   │
│  ├── trigger_type         │                                     │
│  └── steps (JSONB)        │  audit_logs                         │
│                           │  ├── id (UUID PK)                   │
│  plugins                  │  ├── organization_id (FK)           │
│  ├── id (UUID PK)         │  ├── user_id (FK)                   │
│  ├── organization_id (FK) │  ├── action                         │
│  ├── name                 │  └── entity_type                    │
│  └── enabled              │                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Relationships

```sql
-- Organizations and Users (Many-to-Many)
organization_members.organization_id → organizations.id
organization_members.user_id → users.id

-- Projects belong to Organizations
projects.organization_id → organizations.id

-- Campaigns belong to Organizations and optionally to Projects
campaigns.organization_id → organizations.id
campaigns.project_id → projects.id

-- Content belongs to Organizations, optionally to Campaigns and Projects
content.organization_id → organizations.id
content.campaign_id → campaigns.id
content.project_id → projects.id

-- Agents belong to Organizations
agents.organization_id → organizations.id

-- Tasks belong to Organizations and optionally to Agents and Campaigns
tasks.organization_id → organizations.id
tasks.agent_id → agents.id
tasks.campaign_id → campaigns.id

-- AI Providers can be global or organization-specific
ai_providers.organization_id → organizations.id (nullable)

-- Memory is scoped to Organizations
memory.organization_id → organizations.id

-- Analytics and Audit Logs
analytics.organization_id → organizations.id
audit_logs.organization_id → organizations.id (nullable)
audit_logs.user_id → users.id (nullable)
```

## Authentication

### JWT Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Client  │                    │  Server  │                    │ Database │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │  POST /auth/login             │                               │
     │  { email, password }          │                               │
     │──────────────────────────────▶│                               │
     │                               │  Verify password              │
     │                               │──────────────────────────────▶│
     │                               │◀──────────────────────────────│
     │                               │                               │
     │                               │  Generate token pair          │
     │                               │  - Access Token (15min)       │
     │                               │  - Refresh Token (7 days)     │
     │                               │                               │
     │                               │  Store refresh token hash     │
     │                               │──────────────────────────────▶│
     │                               │                               │
     │  Set-Cookie: accessToken      │                               │
     │  Set-Cookie: refreshToken     │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
     │  GET /api/v1/users/profile    │                               │
     │  Authorization: Bearer <JWT>  │                               │
     │──────────────────────────────▶│                               │
     │                               │  Verify JWT signature         │
     │                               │  Check expiry                 │
     │                               │  Extract user payload         │
     │                               │                               │
     │  200 OK { user data }         │                               │
     │◀──────────────────────────────│                               │
     │                               │                               │
```

### Token Structure

```typescript
// Access Token Payload
{
  userId: string;
  email: string;
  role: 'user' | 'admin' | 'superadmin';
  iat: number;
  exp: number;
}

// Refresh Token
// Stored as hash in refresh_tokens table
// Contains: userId, tokenFamily, expiry
```

### Role-Based Access Control (RBAC)

#### User Roles
| Role | Description |
|------|-------------|
| `user` | Standard user, can manage own resources |
| `admin` | Can manage users and organization settings |
| `superadmin` | Full system access |

#### Organization Member Roles
| Role | Description |
|------|-------------|
| `owner` | Full organization control, can delete org |
| `admin` | Can manage members and settings |
| `member` | Can create and manage content |
| `viewer` | Read-only access |

### Middleware Functions

```typescript
// Require authentication
requireAuth(req, res, next)

// Require specific user roles
requireRole('admin', 'superadmin')

// Require organization membership with specific roles
requireOrgAccess('owner', 'admin')
```

## AI Provider Layer

### Provider Router

The Provider Router manages multiple AI providers with automatic failover:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Provider Router                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Request Handler                        │   │
│  │                                                         │   │
│  │  1. Select provider by priority and model availability  │   │
│  │  2. Execute request                                     │   │
│  │  3. On failure, try next provider (failover)            │   │
│  │  4. Track usage and health                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  GenX Router │  │  Together AI │  │  DeepInfra   │          │
│  │  Priority: 3 │  │  Priority: 2 │  │  Priority: 1 │          │
│  │  Status: ✅  │  │  Status: ✅  │  │  Status: ✅  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Interface

All providers implement the same interface:

```typescript
interface ProviderInterface {
  getName(): string;
  getModels(): string[];
  chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<string>;
  embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]>;
  healthCheck(): Promise<boolean>;
  imageGenerate?(prompt: string, model: string, options?: ImageGenerateOptions): Promise<string>;
}
```

### Failover Logic

```typescript
async routeRequest(messages, model, options) {
  const provider = await this.selectProvider(model);
  
  try {
    return await provider.chat(messages, model, options);
  } catch (error) {
    // Try next available provider
    return this.failover(provider.id, messages, model, options);
  }
}

async failover(failedProviderId, messages, model, options) {
  const available = this.providers
    .filter(p => p.id !== failedProviderId && p.enabled && p.health !== 'unhealthy')
    .sort((a, b) => b.priority - a.priority);
  
  for (const provider of available) {
    try {
      return await provider.chat(messages, model, options);
    } catch {
      continue;
    }
  }
  
  throw new Error('All providers failed');
}
```

### Cost Optimization

1. **Priority-based routing** - Higher priority providers are tried first
2. **Model-aware selection** - Routes to provider that supports the requested model
3. **Health-based exclusion** - Unhealthy providers are temporarily excluded
4. **Usage tracking** - Monitors token usage and costs per provider

## Memory Service

The Memory Service provides persistent context storage for AI operations:

### Memory Types

| Type | Purpose | Example |
|------|---------|---------|
| `business` | Business profile and context | Company name, industry, goals |
| `brand` | Brand voice and guidelines | Tone, style, values |
| `conversation` | Chat history and context | Previous messages, preferences |
| `knowledge` | Domain knowledge base | FAQs, product info |
| `preference` | User preferences | Language, format preferences |

### Memory Operations

```typescript
// Store memory
await memoryService.store(key, value, type, orgId, namespace);

// Retrieve memory
const memory = await memoryService.retrieve(key, orgId, namespace);

// Search memory
const results = await memoryService.search(query, orgId, type, limit);

// Business-specific helpers
await memoryService.storeBusinessProfile(orgId, profile);
await memoryService.getBrandVoice(orgId);
await memoryService.getConversationMemory(conversationId);
```

### Business Memory Structure

```typescript
interface BusinessProfile {
  company_name: string;
  industry: string;
  description: string;
  target_audience: {
    demographics: string[];
    interests: string[];
    pain_points: string[];
  };
  brand_voice: {
    tone: string;
    style: string;
    values: string[];
    avoid: string[];
  };
  goals: {
    short_term: string[];
    long_term: string[];
    kpis: string[];
  };
  competitors: Array<{
    name: string;
    strengths: string[];
    weaknesses: string[];
  }>;
}
```

## Plugin System

### Plugin Interface

```typescript
interface PluginInterface {
  id: string;
  name: string;
  version: string;
  description: string;
  hooks: PluginHook[];
  config: PluginConfigSchema;
}

interface PluginHook {
  name: HookName;
  handler: (data: unknown) => Promise<unknown>;
}

type HookName = 'onInit' | 'onBeforeRequest' | 'onAfterRequest' | 'onError' | 'onShutdown';
```

### Plugin Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Lifecycle                          │
│                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Register│───▶│  onInit     │───▶│  Ready              │ │
│  └─────────┘    └─────────────┘    └──────────┬──────────┘ │
│                                               │            │
│       ┌───────────────────────────────────────┘            │
│       │                                                    │
│       ▼                                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │onBeforeReq  │───▶│  Execute    │───▶│onAfterReq   │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│       │                    │                    │          │
│       │              ┌─────▼─────┐              │          │
│       │              │  onError  │              │          │
│       │              └───────────┘              │          │
│       │                                         │          │
│       └─────────────────────────────────────────┘          │
│                                                             │
│  ┌─────────────┐                                           │
│  │  onShutdown  │◀── System shutdown                       │
│  └─────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Plugin Manager

```typescript
class PluginManager {
  async registerPlugin(plugin: PluginInterface): Promise<void>;
  unregisterPlugin(id: string): void;
  async executeHook(hookName: HookName, data: unknown, context?: PluginExecutionContext): Promise<PluginResult[]>;
  async shutdown(): Promise<void>;
}
```

## Docker Infrastructure

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:16-alpine | 5432 | Primary database |
| `redis` | redis:7-alpine | 6379 | Caching and job queues |
| `api` | Custom (Express) | 4000 | Backend API |
| `web` | Custom (Next.js) | 3000 | Frontend application |
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy |

### Networking

```
┌─────────────────────────────────────────────────────────────┐
│                    amarktai-network                         │
│                    (bridge driver)                          │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ postgres │  │  redis   │  │   api    │  │   web    │  │
│  │ :5432    │  │  :6379   │  │  :4000   │  │  :3000   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                             │
│  ┌──────────┐                                              │
│  │  nginx   │                                              │
│  │ :80/:443 │                                              │
│  └──────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

### Volumes

| Volume | Purpose |
|--------|---------|
| `amarktai-postgres-data` | PostgreSQL data persistence |
| `amarktai-redis-data` | Redis data persistence |

### Health Checks

All services have health checks configured:

```yaml
# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres -d amarktai_marketing"]
  interval: 10s
  timeout: 5s
  retries: 5

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 5s
  retries: 5

# API
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:4000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Security

### Encryption

- **API Keys**: Encrypted at rest using AES-256-CBC
- **Passwords**: Hashed with bcrypt (10 rounds)
- **JWT Tokens**: Signed with HMAC-SHA256
- **Refresh Tokens**: Stored as SHA-256 hashes

### Rate Limiting

```typescript
// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoint rate limit (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 requests per window
});
```

### CORS Configuration

```typescript
app.use(cors({
  origin: env.APP_URL, // Only allow frontend origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

### Security Headers

```typescript
app.use(helmet({
  contentSecurityPolicy: false, // Handled by Next.js
  crossOriginEmbedderPolicy: false,
}));

// Nginx adds additional headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

### Input Validation

All inputs are validated using Zod schemas:

```typescript
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(255),
});
```

## Performance Optimizations

### Database

- **Connection pooling** via `pg` pool
- **Indexed columns** for frequent queries
- **JSONB columns** for flexible metadata
- **Soft deletes** with `deleted_at` timestamps

### Caching

- **Redis** for session storage and rate limiting
- **HTTP caching** for static assets (1 year)
- **Next.js** automatic static optimization

### API

- **Compression** via gzip
- **Pagination** for list endpoints
- **Selective field queries** to reduce payload

### Frontend

- **Code splitting** via Next.js App Router
- **Image optimization** via Next.js Image component
- **Font optimization** with `next/font`
- **Turbopack** for fast development builds

## Milestone 2: Research & Knowledge

### Services Added

| Service | File | Purpose |
|---------|------|---------|
| `knowledge.service.ts` | `apps/api/src/services/knowledge.service.ts` | CRUD for knowledge sources and items, search, sync |
| `crawler.service.ts` | `apps/api/src/services/crawler.service.ts` | Website crawling, HTML parsing, text chunking |
| `competitor.service.ts` | `apps/api/src/services/competitor.service.ts` | Competitor tracking, website checks, change detection |
| `trend.service.ts` | `apps/api/src/services/trend.service.ts` | Trend monitoring, alert management, item tracking |
| `vector.service.ts` | `apps/api/src/services/vector.service.ts` | Embedding generation, similarity search via pgvector |

### API Routes Added

| Route | Prefix | Description |
|-------|--------|-------------|
| `knowledge.ts` | `/api/v1/knowledge` | Knowledge sources, items, search, sync |
| `competitors.ts` | `/api/v1/competitors` | Competitor CRUD, checks, snapshots |
| `trends.ts` | `/api/v1/trends` | Trend monitors, items, alerts |

### Database Tables Added (Migration 003)

- `knowledge_sources` - Content source definitions
- `knowledge_items` - Chunked knowledge content with embeddings
- `competitors` - Tracked competitor companies
- `competitor_snapshots` - Point-in-time competitor data
- `trend_monitoring` - Trend monitor configurations
- `trend_items` - Individual trend entries

### Frontend Pages Added

| Page | Route | Description |
|------|-------|-------------|
| Knowledge | `/knowledge` | Manage knowledge sources, sync, search |
| Competitors | `/competitors` | Track competitors, run checks, view changes |
| Trends | `/trends` | Monitor trends, view alerts, manage items |
