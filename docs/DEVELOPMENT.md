# Development Guide

Developer setup and contribution guidelines for AmarktAI Marketing.

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Docker** 24.0+ and Docker Compose v2.20+
- **Git** 2.30+

## Setup

### 1. Fork and Clone

```bash
git clone https://github.com/your-username/amarktai-marketing.git
cd amarktai-marketing
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all workspaces (apps/api, apps/web, packages/ui).

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` for local development:

```bash
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:4000

# Use local Docker services
DATABASE_URL=postgresql://amarktai:amarktai_secure_password@localhost:5432/amarktai_marketing
REDIS_URL=redis://localhost:6379

# Development secrets (DO NOT use in production)
JWT_SECRET=dev-jwt-secret-minimum-32-characters-long
JWT_REFRESH_SECRET=dev-jwt-refresh-secret-minimum-32-chars
ENCRYPTION_KEY=dev-encryption-key-32-chars-long!!

# Optional: AI providers
GENX_API_KEY=
TOGETHER_API_KEY=
DEEPINFRA_API_KEY=

FIRST_RUN=true
```

### 4. Start Docker Services

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

This starts PostgreSQL and Redis in Docker.

### 5. Run Database Migrations

```bash
npm run db:migrate
```

### 6. Seed Database (Optional)

```bash
npm run db:seed
```

### 7. Start Development Servers

```bash
npm run dev
```

This starts both the API and web servers using Turborepo:
- **API:** http://localhost:4000
- **Web:** http://localhost:3000

## Project Structure

```
amarktai-marketing/
├── apps/
│   ├── api/                        # Express.js backend
│   │   ├── src/
│   │   │   ├── config/             # Configuration
│   │   │   │   ├── database.ts     # PostgreSQL connection
│   │   │   │   ├── env.ts          # Environment variables
│   │   │   │   └── redis.ts        # Redis connection
│   │   │   ├── db/                 # Database
│   │   │   │   ├── migrations/     # SQL migrations
│   │   │   │   └── seeds/          # Seed data
│   │   │   ├── memory/             # Memory service
│   │   │   │   ├── business.memory.ts
│   │   │   │   ├── conversation.memory.ts
│   │   │   │   └── memory.service.ts
│   │   │   ├── middleware/          # Express middleware
│   │   │   │   ├── auth.ts         # JWT authentication
│   │   │   │   ├── errorHandler.ts # Error handling
│   │   │   │   ├── rateLimit.ts    # Rate limiting
│   │   │   │   └── validator.ts    # Request validation
│   │   │   ├── plugins/            # Plugin system
│   │   │   │   ├── plugin.interface.ts
│   │   │   │   └── plugin-manager.ts
│   │   │   ├── providers/          # AI providers
│   │   │   │   ├── deepinfra.provider.ts
│   │   │   │   ├── genx.provider.ts
│   │   │   │   ├── provider-router.ts
│   │   │   │   └── together.provider.ts
│   │   │   ├── queue/              # Job queues
│   │   │   │   ├── queue.service.ts
│   │   │   │   └── workers/
│   │   │   ├── routes/             # API routes
│   │   │   │   ├── agents.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── campaigns.ts
│   │   │   │   ├── content.ts
│   │   │   │   ├── health.ts
│   │   │   │   ├── onboarding.ts
│   │   │   │   ├── organizations.ts
│   │   │   │   ├── providers.ts
│   │   │   │   └── users.ts
│   │   │   ├── services/           # Business logic
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── onboarding.service.ts
│   │   │   │   ├── organization.service.ts
│   │   │   │   └── provider.service.ts
│   │   │   ├── types/              # TypeScript types
│   │   │   │   └── index.ts
│   │   │   ├── utils/              # Utilities
│   │   │   │   ├── encryption.ts
│   │   │   │   ├── jwt.ts
│   │   │   │   ├── logger.ts
│   │   │   │   └── validation.ts
│   │   │   └── server.ts           # Entry point
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                        # Next.js frontend
│       ├── app/
│       │   ├── (auth)/             # Auth pages
│       │   ├── (dashboard)/        # Dashboard pages
│       │   ├── (marketing)/        # Public pages
│       │   ├── onboarding/         # Setup wizard
│       │   ├── layout.tsx          # Root layout
│       │   ├── error.tsx           # Error boundary
│       │   └── not-found.tsx       # 404 page
│       ├── public/                 # Static assets
│       ├── src/                    # Source files
│       ├── Dockerfile
│       ├── package.json
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── packages/
│   └── ui/                         # Shared UI components
│       ├── src/
│       └── package.json
├── docker/
│   ├── docker-compose.yml          # Production
│   ├── docker-compose.dev.yml      # Development
│   ├── init-scripts/               # DB init scripts
│   └── nginx/                      # Nginx config
├── docs/                           # Documentation
├── turbo.json                      # Turborepo config
├── package.json                    # Root package.json
└── .env.example                    # Environment template
```

## Adding New Features

### Adding a New API Route

1. **Create route file** in `apps/api/src/routes/`:

```typescript
// apps/api/src/routes/tags.ts
import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { query } from '../config/database';
import { z } from 'zod';
import { ApiResponse } from '../types';

const router = Router();
router.use(requireAuth);

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  organization_id: z.string().uuid(),
});

router.post('/', validateBody(createTagSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, organization_id } = req.body;
    const result = await query(
      'INSERT INTO tags (name, organization_id) VALUES ($1, $2) RETURNING *',
      [name, organization_id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
```

2. **Register route** in `apps/api/src/server.ts`:

```typescript
import tagRoutes from './routes/tags';

app.use('/api/v1/tags', tagRoutes);
```

3. **Add validation schema** in `apps/api/src/utils/validation.ts` if needed.

### Adding a New Frontend Page

1. **Create page** in the appropriate route group:

```typescript
// apps/web/app/(dashboard)/tags/page.tsx
'use client';

import { useState, useEffect } from 'react';

export default function TagsPage() {
  const [tags, setTags] = useState([]);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    const response = await fetch('/api/v1/tags');
    const data = await response.json();
    if (data.success) {
      setTags(data.data);
    }
  };

  return (
    <div>
      <h1>Tags</h1>
      {/* UI implementation */}
    </div>
  );
}
```

2. **Add navigation** in the dashboard layout if needed.

### Adding a New Database Migration

1. **Create migration file**:

```bash
touch apps/api/src/db/migrations/002_add_tags.sql
```

2. **Write migration SQL**:

```sql
-- 002_add_tags.sql
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE INDEX idx_tags_org ON tags(organization_id);
```

3. **Run migrations**:

```bash
npm run db:migrate
```

### Adding a New Service

1. **Create service file** in `apps/api/src/services/`:

```typescript
// apps/api/src/services/tag.service.ts
import { query, transaction } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';

export async function list(orgId: string) {
  const result = await query(
    'SELECT * FROM tags WHERE organization_id = $1 ORDER BY name',
    [orgId]
  );
  return result.rows;
}

export async function create(orgId: string, name: string) {
  const result = await query(
    'INSERT INTO tags (name, organization_id) VALUES ($1, $2) RETURNING *',
    [name, orgId]
  );
  return result.rows[0];
}

export async function remove(id: string, orgId: string) {
  const result = await query(
    'DELETE FROM tags WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Tag');
  }
}
```

2. **Use service in route**:

```typescript
import * as tagService from '../services/tag.service';

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const tags = await tagService.list(req.body.organization_id);
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
});
```

## Database Migrations

### Running Migrations

```bash
# Build and run migrations
npm run db:migrate

# Or manually
cd apps/api
npm run build
node dist/db/migrate.js
```

### Creating Migrations

1. Create a new `.sql` file in `apps/api/src/db/migrations/`
2. Use sequential numbering: `002_description.sql`
3. Write your SQL statements
4. Run `npm run db:migrate`

### Migration Best Practices

- Always add `IF NOT EXISTS` for CREATE TABLE
- Always add `IF EXISTS` for DROP TABLE
- Use `ON DELETE CASCADE` for foreign keys where appropriate
- Add indexes for columns used in WHERE clauses
- Use `UUID` for primary keys
- Include `created_at` and `updated_at` timestamps
- Use soft deletes with `deleted_at` column

## Testing Strategy

### Unit Tests

```bash
# Run all tests
npm test

# Run API tests
cd apps/api && npm test

# Run web tests
cd apps/web && npm test
```

### Integration Tests

Test API endpoints with a test database:

```typescript
// apps/api/src/__tests__/auth.test.ts
import request from 'supertest';
import app from '../server';

describe('Auth API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('test@example.com');
  });
});
```

### E2E Tests

Use Playwright for end-to-end testing:

```bash
cd apps/web
npx playwright test
```

## Code Style and Conventions

### TypeScript

- Use strict mode
- Define types in `types/index.ts`
- Use interfaces for object shapes
- Use enums for constants

```typescript
// Good
interface User {
  id: string;
  email: string;
  name: string;
}

type UserRole = 'user' | 'admin' | 'superadmin';

// Avoid
const user: any = { ... };
```

### React Components

- Use functional components with hooks
- Use `'use client'` for client components
- Keep components small and focused
- Use TypeScript props interface

```typescript
// Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button className={variant} onClick={onClick}>
      {label}
    </button>
  );
}
```

### API Routes

- Use try/catch with next(error)
- Validate inputs with Zod
- Return consistent response format
- Use async/await

```typescript
// Good
router.post('/', validateBody(schema), async (req, res, next) => {
  try {
    const result = await service.create(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
```

### File Naming

- **Routes:** `feature.route.ts` or `feature.ts`
- **Services:** `feature.service.ts`
- **Middleware:** `feature.middleware.ts` or descriptive name
- **Types:** `feature.types.ts` or in `types/index.ts`
- **Components:** `FeatureName.tsx` (PascalCase)

### Imports

```typescript
// External dependencies first
import { Router } from 'express';
import { z } from 'zod';

// Internal modules
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { ApiResponse } from '../types';
```

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring

### Commit Messages

```
type(scope): description

feat(auth): add password reset endpoint
fix(api): handle null organization_id
docs(readme): update installation instructions
refactor(services): extract validation logic
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes
3. Run linting: `npm run lint`
4. Run type checking: `npx tsc --noEmit`
5. Run tests: `npm test`
6. Push branch and create PR
7. Request review
8. Merge after approval

### Code Review Checklist

- [ ] Code follows project conventions
- [ ] Types are properly defined
- [ ] Error handling is comprehensive
- [ ] Inputs are validated
- [ ] No secrets or keys in code
- [ ] Tests are included
- [ ] Documentation is updated

## Debugging

### API Debugging

```bash
# Enable debug logging
DEBUG=* npm run dev

# Or specific modules
DEBUG=amarktai:* npm run dev
```

### Database Debugging

```bash
# Connect to database
docker exec -it amarktai-postgres psql -U amarktai -d amarktai_marketing

# View tables
\dt

# Describe table
\d users

# Run query
SELECT * FROM users LIMIT 10;
```

### Redis Debugging

```bash
# Connect to Redis
docker exec -it amarktai-redis redis-cli

# List keys
KEYS *

# Get value
GET session:abc123
```

## Common Tasks

### Reset Database

```bash
# Drop and recreate
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d postgres redis
npm run db:migrate
npm run db:seed
```

### Clear Redis Cache

```bash
docker exec amarktai-redis redis-cli FLUSHALL
```

### Rebuild Docker Images

```bash
docker compose -f docker/docker-compose.yml build --no-cache
docker compose -f docker/docker-compose.yml up -d
```

### Update Dependencies

```bash
# Update all
npm update

# Update specific package
npm update package-name

# Check outdated
npm outdated
```
