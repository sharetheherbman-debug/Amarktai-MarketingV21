# AmarktAI Marketing

**AmarktAI Marketing** is a multi-tenant AI marketing operating system with campaign automation, content workflows, provider routing, Creative Studio generation, and a persistent long-form video production pipeline.

Production domain: `https://marketing.equiprofile.online`

## Current runtime

The repository contains:

- Next.js 15 and React 19 web application
- Express and TypeScript API
- PostgreSQL 16 with pgvector
- Redis 7 and BullMQ
- Dedicated generation and FFmpeg render workers
- GenX Router integration with server-side credentials
- Secure organization-owned media assets
- Creative Studio image, video, audio and lip-sync workflows
- Long-form projects, scripts, storyboards, scenes, continuity, narration, music, captions, rendering and exports
- Docker images for API, web and render worker
- Nginx internal reverse proxy
- Caddy automatic HTTPS edge for VPS deployment
- Encrypted database and media backup/restore scripts
- Backup-first update and rollback workflow

## Repository

```bash
git clone https://github.com/sharetheherbman-debug/Amarktai-MarketingV21.git
cd Amarktai-MarketingV21
```

## Development

Prerequisites:

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 16
- Redis 7

```bash
npm ci
cp .env.example .env
# Fill in the development database, Redis and provider settings.
npm run db:migrate
npm run dev
```

The default development services are:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## Docker validation

The base Compose stack is intended for a complete local or server-like Docker run. It requires strong database, Redis, JWT, encryption and GenX values.

```bash
cp .env.example .env
# Replace all placeholder values, including GENX_API_KEY.
npm run docker:build
npm run docker:up
```

The internal Nginx proxy is bound to `http://127.0.0.1:8080` by default. PostgreSQL, Redis, API and web ports are not exposed publicly.

```bash
npm run docker:down
```

## Production VPS deployment

Use an Ubuntu 22.04 or 24.04 VPS with at least 4 CPU cores, 8 GB RAM, 20 GB free disk, Docker Engine 24+, Docker Compose v2.20+, and public ports 80 and 443.

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Replace every placeholder and provide the production GenX credentials.
npm run vps:preflight
npm run vps:deploy
```

The production stack publishes only Caddy on ports 80 and 443. Caddy obtains and renews TLS automatically for the configured domain, then proxies through internal Nginx to the web and API services.

Canonical instructions: [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md)

## Health and readiness

- `/health` — public edge liveness
- `/ready` — PostgreSQL and Redis readiness through the API
- `/api/v1/health` — API liveness and version
- `/api/v1/health/version` — build metadata

Docker separately validates the generation worker and render worker processes and their Redis connectivity. The production smoke test waits for all eight services before passing.

```bash
npm run vps:smoke
```

## Backups and updates

Create an encrypted database and Studio-media backup:

```bash
npm run vps:backup
```

Restore a verified backup:

```bash
npm run vps:restore -- /opt/amarktai/backups/amarktai-YYYYMMDDTHHMMSSZ.tar.gz.enc --yes
```

Apply a backup-first update with automatic Git rollback when deployment fails:

```bash
npm run vps:update
```

## Main commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development services |
| `npm run build` | Build all workspaces |
| `npm run audit` | Reject high-severity dependency findings |
| `npm run verify` | Run repository verification |
| `npm run db:migrate` | Apply database migrations |
| `npm run docker:build` | Build the base Docker stack |
| `npm run docker:up` | Start the base Docker stack |
| `npm run vps:preflight` | Validate VPS resources and production settings |
| `npm run vps:deploy` | Build, migrate, deploy, wait and smoke-test production |
| `npm run vps:backup` | Create encrypted database and media backup |
| `npm run vps:restore` | Restore a verified encrypted backup |
| `npm run vps:update` | Backup, update, deploy and roll back on failure |

## Project structure

```text
apps/api/                 Express API, providers, queues, workers and migrations
apps/web/                 Next.js web application
packages/studio/          Creative Studio and long-form production UI
scripts/                  Verification and VPS operational workflows
docker/                   Base and production Compose, Nginx and Caddy
docs/                     Architecture, API, deployment and runtime evidence
```

## Production acceptance

Repository CI verifies compilation, tests, security, migrations, application images, proxy configuration and Compose configuration. A public launch still requires the production GenX key and VPS to run the external acceptance steps:

1. Runtime-test the selected GenX image, video, voice, audio and lip-sync models.
2. Verify a real signed provider webhook.
3. Generate and render the required six-scene film of at least 60 seconds.
4. Record provider job IDs, result URLs, usage and costs.
5. Restart workers during queued work and verify recovery.
6. Run the public production smoke test after DNS and TLS are active.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE).
