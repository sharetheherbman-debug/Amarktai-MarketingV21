# AmarktAI Marketing

AmarktAI Marketing is a standalone, reusable, white-label marketing operating system. It combines business knowledge, research, campaign planning, governed content and media production, approvals, publishing, CRM, analytics, and controlled autonomous operation.

EquiProfile is customer deployment #1. EquiProfile branding and host-product context are deployment configuration; the engine is not coupled to EquiProfile source code.

## Repository architecture

- `apps/web` — Next.js client application.
- `apps/api` — Express API, PostgreSQL access, queues, workers, provider boundaries, and signed Application Connector.
- `packages/studio` — reusable Creative Studio and long-form production UI.
- `packages/application-connector-sdk` — server-side host connector SDK.
- `packages/ui` — shared presentation primitives.
- `docker` — local and production Compose definitions and reverse-proxy configuration.
- `scripts` — verification and controlled deployment helpers.

The worker architecture contains a generation worker, long-form still-motion worker, and render worker. PostgreSQL owns durable product state; Redis/BullMQ owns queued work; generated media must be copied into organization-owned durable Studio storage.

## Product

The intended client navigation is:

1. Command Centre
2. Business Brain
3. Research & Intelligence
4. Strategy & Campaigns
5. Content Studio
6. Creative Studio
7. Calendar & Production
8. Publish & Channels
9. CRM
10. Analytics & Optimisation
11. Marketing Team
12. Workflows & Approvals
13. Connections
14. Usage & Safety
15. Settings

Developer and platform-administration routes may remain available to authorised operators, but they are not part of ordinary client navigation.

## Application Connector

Host applications integrate server-to-server through the signed Application Connector under `/api/v1/application-connectors`. The contract uses an application identifier, key, HMAC signature, timestamp, replay protection, one-use SSO codes, explicit product/service scopes, approved business snapshots, and idempotent conversion events. Shared secrets never belong in browser code.

See [Application Connector](docs/APPLICATION_CONNECTOR.md) and the [connector SDK](packages/application-connector-sdk/README.md).

## Development

Requirements: Node.js 22+, npm 10+, PostgreSQL 16 with pgvector, Redis, and FFmpeg for render workflows.

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

Do not put production secrets in `.env`, documentation, browser configuration, or Git.

## Testing

```bash
npm run lint
npm run build
npm run test --workspace=@amarktai/api
npm run verify
```

The final release gate also includes fresh and upgrade-path migrations, connector SDK checks, real API/database-backed browser acceptance, Docker image builds, Compose validation, and security audit. See [Testing and acceptance](docs/TESTING_AND_ACCEPTANCE.md).

## Deployment

Production deployment is an explicit owner-controlled operation. Create and verify a backup, deploy one reviewed SHA, apply only forward migrations, start workers in a controlled order, run live browser/provider acceptance, and retain a tested rollback path. Never deploy an unreviewed branch head or rebuild client assets manually on the server.

See [Deployment](docs/DEPLOYMENT.md), [Operations](docs/OPERATIONS.md), and [Client handover](docs/CLIENT_HANDOVER.md).

## Exact release process

1. Work on the named reconciliation/release branch.
2. Keep historical migrations immutable.
3. Run the complete local acceptance matrix.
4. Commit coherent changes and confirm a clean tree.
5. Push without force and wait for CI on the exact SHA.
6. Record the branch, SHA, migration delta, test/build results, known warnings, and external activation gates.
7. Deploy only that SHA in a separate authorised task.

## Canonical documentation

[docs/INDEX.md](docs/INDEX.md) identifies the authoritative documents and distinguishes specialist reference material from superseded history retained by Git.
