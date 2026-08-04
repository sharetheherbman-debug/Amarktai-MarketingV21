# AmarktAI Marketing

<div align="center">

**The AI Marketing Operating System**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](docker-compose.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](tsconfig.json)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](apps/web)
[![Express](https://img.shields.io/badge/Express-4.18-green?logo=express)](apps/api)

</div>

---

AmarktAI Marketing is an autonomous AI marketing platform that deploys an AI workforce to handle content creation, SEO, social media, email marketing, analytics, and campaign automation. Built for businesses that want to scale their marketing operations without scaling their team.

**Domain:** [marketing.amarktai.co.za](https://marketing.amarktai.co.za)

## Quick Start

Get up and running in under 5 minutes with Docker:

```bash
# Clone the repository
git clone https://github.com/amarktai/marketing.git
cd marketing

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
# At minimum, set JWT_SECRET, JWT_REFRESH_SECRET, and ENCRYPTION_KEY

# Start all services
docker compose -f docker/docker-compose.yml up -d

# Access the application
# Frontend: http://localhost:3000
# API: http://localhost:4000
```

On first visit, the onboarding wizard will guide you through:
1. Creating your admin account
2. Configuring your organization
3. Setting up AI providers (GenX Router, Together AI, DeepInfra)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nginx (Port 80/443)                     │
│                    Reverse Proxy + SSL Termination              │
└─────────────┬───────────────────────────────┬───────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   Next.js Frontend      │     │      Express API                │
│   (Port 3000)           │     │      (Port 4000)                │
│                         │     │                                 │
│   - App Router           │     │   - REST API v1                 │
│   - React 19             │     │   - JWT Authentication          │
│   - Tailwind CSS         │     │   - Service Layer               │
│   - Zustand State        │     │   - Repository Pattern          │
└─────────────────────────┘     └───────────┬─────────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
        ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
        │   PostgreSQL 16   │    │    Redis 7       │    │   AI Providers   │
        │   (Port 5432)     │    │   (Port 6379)    │    │                  │
        │                   │    │                  │    │   - GenX Router  │
        │   - Users         │    │   - Sessions     │    │   - Together AI  │
        │   - Organizations │    │   - Job Queues   │    │   - DeepInfra    │
        │   - Campaigns     │    │   - Rate Limiting│    │                  │
        │   - Content       │    │   - Caching      │    └──────────────────┘
        │   - Agents        │    └──────────────────┘
        │   - Memory        │
        └──────────────────┘
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js | 15.x |
| UI Library | React | 19.x |
| Styling | Tailwind CSS | 3.4.x |
| State Management | Zustand | 5.x |
| Backend | Express | 4.18.x |
| Language | TypeScript | 5.7.x |
| Database | PostgreSQL | 16 |
| Cache/Queue | Redis | 7 |
| Job Queue | BullMQ | 5.x |
| Validation | Zod | 3.x |
| Build System | Turborepo | 2.x |
| Containerization | Docker | Latest |

### AI Providers

| Provider | Use Case | Models |
|----------|----------|--------|
| **GenX Router** | Primary LLM provider | GPT-4o, Claude 3, Gemini Pro, Llama 3.1 |
| **Together AI** | Open-source models | Llama 3.1 405B, Mixtral 8x22B, Qwen2 72B |
| **DeepInfra** | Cost-effective inference | Llama 3.1, Mixtral, Gemma 2, DeepSeek |

## Features

### Core Capabilities
- **AI Content Generation** - Blog posts, social media content, email copy, ad copy
- **Campaign Automation** - Multi-channel campaign management with scheduling
- **Agent System** - Configurable AI agents for specialized marketing tasks
- **Memory Service** - Business context, brand voice, and conversation memory
- **Plugin System** - Extensible architecture with lifecycle hooks

### Management
- **Organization Management** - Multi-tenant with role-based access control
- **User Management** - Profiles, password management, email verification
- **Provider Management** - Configure and monitor multiple AI providers
- **Onboarding Wizard** - Guided setup for first-time users

### Security
- JWT-based authentication with refresh tokens
- Encrypted API key storage
- Rate limiting and request validation
- CORS and security headers
- Audit logging

## Installation

### Docker Installation (Recommended)

```bash
# Prerequisites: Docker and Docker Compose installed

# Clone repository
git clone https://github.com/amarktai/marketing.git
cd marketing

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Build and start
docker compose -f docker/docker-compose.yml up -d

# Check status
docker compose -f docker/docker-compose.yml ps

# View logs
docker compose -f docker/docker-compose.yml logs -f api
```

### Manual Installation

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16, Redis 7

# Clone repository
git clone https://github.com/amarktai/marketing.git
cd marketing

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and Redis credentials

# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed

# Start development servers
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | API server port | `4000` |
| `APP_URL` | Frontend URL | `http://localhost:3000` |
| `API_URL` | Backend URL | `http://localhost:4000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | Required in production |
| `JWT_REFRESH_SECRET` | Refresh token secret | Required in production |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `ENCRYPTION_KEY` | API key encryption key | Required in production |
| `GENX_API_KEY` | GenX Router API key | Optional |
| `TOGETHER_API_KEY` | Together AI API key | Optional |
| `DEEPINFRA_API_KEY` | DeepInfra API key | Optional |
| `SMTP_HOST` | SMTP server host | Optional |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | Optional |
| `SMTP_PASS` | SMTP password | Optional |
| `FIRST_RUN` | Enable onboarding wizard | `true` |

## API Documentation

The API follows REST conventions and returns JSON responses.

**Base URL:** `http://localhost:4000/api/v1`

**Authentication:** Bearer token in Authorization header
```
Authorization: Bearer <access_token>
```

See [docs/API.md](docs/API.md) for complete endpoint documentation.

## Project Structure

```
amarktai-marketing/
├── apps/
│   ├── api/                    # Express.js backend
│   │   ├── src/
│   │   │   ├── config/         # Database, Redis, environment config
│   │   │   ├── db/             # Migrations and seeds
│   │   │   ├── memory/         # Memory service (business, brand, conversation)
│   │   │   ├── middleware/      # Auth, validation, rate limiting, error handling
│   │   │   ├── plugins/        # Plugin system
│   │   │   ├── providers/      # AI provider integrations
│   │   │   ├── queue/          # BullMQ job queue
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic layer
│   │   │   ├── types/          # TypeScript type definitions
│   │   │   └── utils/          # Encryption, JWT, logging, validation
│   │   └── Dockerfile
│   └── web/                    # Next.js frontend
│       ├── app/
│       │   ├── (auth)/         # Auth pages (login, register, etc.)
│       │   ├── (dashboard)/    # Dashboard pages
│       │   ├── (marketing)/    # Marketing pages
│       │   └── onboarding/     # Onboarding wizard
│       └── Dockerfile
├── packages/
│   └── ui/                     # Shared UI components
├── docker/
│   ├── docker-compose.yml      # Production compose
│   ├── docker-compose.dev.yml  # Development compose
│   ├── init-scripts/           # Database initialization
│   └── nginx/                  # Nginx configuration
├── docs/                       # Documentation
├── turbo.json                  # Turborepo configuration
└── package.json                # Root package.json
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System architecture and design decisions
- [API Reference](docs/API.md) - Complete API endpoint documentation
- [Database](docs/DATABASE.md) - Schema, migrations, and data model
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guide
- [AI Providers](docs/PROVIDERS.md) - Provider configuration and management
- [Development](docs/DEVELOPMENT.md) - Developer setup and contribution guide

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed development guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**AmarktAI Marketing** - Automate your marketing with AI.
