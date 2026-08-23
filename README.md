# AmarktAI Marketing

**AmarktAI Marketing** is a standalone, reusable multi-tenant AI marketing operating system with campaign automation, content workflows, provider routing, Creative Studio generation, host-application connectors and a persistent long-form production pipeline.

The first customer deployment is EquiProfile Marketing at `https://marketing.equiprofile.online`. The application itself remains white-label and connects to host products through the signed server-side Application Connector rather than product-specific browser coupling.

## Current runtime

The repository contains:

- Next.js 15 and React 19 web application;
- Express and TypeScript API;
- PostgreSQL 16 with pgvector;
- Redis 7 and BullMQ;
- dedicated generation, long-form still-motion and FFmpeg render workers;
- GenX Router integration with server-side credentials;
- reusable signed Application Connector SDK;
- secure organization-owned media assets;
- Creative Studio image, video and audio workflows;
- long-form projects, scripts, storyboards, scenes, continuity, narration, music, captions, rendering and exports;
- Docker images for API, web and workers;
- internal Nginx reverse proxy;
- optional Caddy standalone HTTPS edge;
- encrypted database/Redis/media/config backup and restore scripts;
- exact-SHA, backup-first deployment/update/rollback workflow.

## Repository

```bash
git clone https://github.com/sharetheherbman-debug/Amarktai-MarketingV21.git
cd Amarktai-MarketingV21
```

## Development

Prerequisites:

- Node.js 22 LTS or newer supported by the repository engine;
- npm 10;
- PostgreSQL 16;
- Redis 7.

```bash
npm ci
cp .env.example .env
# Fill in the development database, Redis and provider settings.
npm run db:migrate
npm run dev
```

Default development endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## Docker validation

The base Compose stack is intended for a complete local/server-like Docker run and requires explicit database, Redis, JWT, encryption and GenX values.

```bash
cp .env.example .env
# Replace all required placeholder values, including GENX_API_KEY.
npm run docker:build
npm run docker:up
```

The internal Nginx proxy is bound to loopback by default. PostgreSQL, Redis, API and web ports are not exposed publicly.

```bash
npm run docker:down
```

## Production VPS deployment

Canonical production instructions are in [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md). That runbook is authoritative for the fresh handover installation.

The EquiProfile customer topology uses the existing host Nginx on public ports 80/443 and proxies only `marketing.equiprofile.online` to Marketing's loopback edge. Caddy is used only for a standalone deployment when `SHARED_HOST_NGINX=false`.

Before any destructive cleanup:

1. inventory the live VPS and classify Marketing-owned versus shared resources;
2. create and verify a complete encrypted rollback backup;
3. copy the rollback artifact off-server;
4. remove only explicitly identified obsolete Marketing application assets;
5. install the exact frozen reviewed SHA.

Do **not** blindly delete databases, Docker volumes, uploads, certificates, environment files, shared proxy configuration or rollback backups.

Prepare production configuration from the neutral template:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Replace every placeholder/example value with the reviewed production configuration.
```

The release uses an explicit branch only to locate the reviewed commit and always deploys the exact SHA:

```dotenv
DEPLOY_BRANCH=release-candidate/marketing-product-2026-08-22
DEPLOY_SHA=<exact frozen green-CI Marketing SHA>
```

Run preflight/release checks and create the compatible rollback bundle before deployment:

```bash
npm run vps:preflight
bash scripts/vps-release-gate.sh
npm run vps:backup
```

After the cleanup/inventory procedure in the canonical runbook, deploy core only:

```bash
bash scripts/vps-deploy.sh core
```

Workers remain off until signed host connector/SSO + Marketing MFA and direct GenX provider acceptance succeed. Then start them in the controlled worker stage:

```bash
bash scripts/vps-deploy.sh workers
npm run vps:smoke -- full
```

## Health and readiness

The stack exposes liveness/readiness through the internal/public edge and API health routes. Production smoke testing validates core service health and, when requested, the worker processes and their Redis connectivity.

After DNS, host Nginx and TLS are correct:

```bash
bash scripts/vps-smoke.sh public
```

## Backups, restore and updates

Create the current project-scoped encrypted rollback bundle:

```bash
npm run vps:backup
```

The generated filename is based on `COMPOSE_PROJECT_NAME` and is written beneath `BACKUP_DIR`. Restore only the actual verified artifact produced by the deployment:

```bash
bash scripts/vps-restore.sh "$BACKUP_DIR/<generated-project-backup>.tar.gz.enc" --yes
```

A source update is backup-first and exact-SHA pinned:

```bash
npm run vps:update
```

Never substitute `latest` or an unreviewed branch head for `DEPLOY_SHA`.

## Host Application Connector

The reusable server-side connector is in `packages/application-connector-sdk`. New integrations use generic `HOST_APP_*` settings; historical `EQUIPROFILE_*` connector names remain compatibility aliases for the first host only.

The connector provides signed health, one-use administrator SSO, conversion delivery and approved business snapshots with HMAC authentication, timestamp/nonce replay protection, generic product/service scopes and a sensitive-data rejection boundary.

Read:

- [`docs/HOST_APP_QUICKSTART.md`](docs/HOST_APP_QUICKSTART.md)
- [`docs/HOST_APP_INTEGRATION.md`](docs/HOST_APP_INTEGRATION.md)
- [`docs/HOST_APP_SECURITY.md`](docs/HOST_APP_SECURITY.md)
- [`docs/HOST_APP_EVENT_CONTRACT.md`](docs/HOST_APP_EVENT_CONTRACT.md)

Browser sessions use HttpOnly cookies and Marketing MFA. For a new connector-created workspace, the first authorized host administrator becomes Marketing owner; subsequent authorized host administrators become Marketing admins.

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
| `npm run vps:preflight` | Validate VPS resources, production settings and live GenX catalogue/pricing access |
| `npm run vps:backup` | Create encrypted PostgreSQL/Redis/media/config rollback bundle |
| `npm run vps:restore` | Restore a verified encrypted backup |
| `npm run vps:update` | Backup, fetch and deploy an exact reviewed SHA with rollback handling |

## Project structure

```text
apps/api/                 Express API, providers, queues, workers and migrations
apps/web/                 Next.js web application
packages/                 Reusable SDKs/components including the Application Connector SDK
scripts/                  Verification and VPS operational workflows
docker/                   Base/production Compose, Nginx and optional Caddy edge
docs/                     Architecture, connector, deployment and runtime evidence
```

## Release acceptance

Repository CI must be green on the **exact frozen SHA** for:

- secure dependency lock refresh;
- high-severity dependency audit;
- API and Web TypeScript;
- reusable connector SDK build;
- API regression tests;
- clean ordered migrations through the current migration tail;
- production application builds;
- Docker images, Compose and proxy validation;
- repository Verification Suite.

Production acceptance still requires the real VPS and credentials to prove:

1. signed host connector health, one-use SSO, owner/admin behavior and Marketing MFA;
2. browser authentication without JavaScript-readable JWT storage;
3. live GenX catalogue/pricing and selected generation paths with no hidden provider fallback;
4. webhook/error/reversal behavior and Generation Credit accounting;
5. staged worker recovery/idempotency;
6. configured SMTP delivery/password-recovery path if retained;
7. enabled social/provider connectors under owner/control policies;
8. public DNS/Nginx/TLS and responsive browser acceptance;
9. rollback/restore evidence.

Only after both repository and production acceptance are recorded should the Marketing release be handed over.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE).
