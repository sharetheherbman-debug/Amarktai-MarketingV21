# Architecture

## System boundary

AmarktAI Marketing is an independent multi-tenant service. It does not share a database, session secret, provider secret, or deployment failure domain with a host application.

```text
Host application
  -> signed server-side Application Connector (/api/v1)
Marketing web -> Marketing API -> PostgreSQL
                            -> Redis/BullMQ
                            -> generation worker
                            -> long-form still-motion worker (FFmpeg)
                            -> render worker (FFmpeg)
                            -> organisation-owned media storage
                            -> configured providers/channels
```

## Monorepo

- `apps/web`: Next.js App Router application. Browser requests use a centrally normalised same-origin `/api/v1` base and secure session flow.
- `apps/api`: Express API, services, PostgreSQL migrations, provider boundaries, job submission, and worker entry points.
- `packages/studio`: Creative Studio/long-form UI and client contract.
- `packages/application-connector-sdk`: white-label server-side connector client.
- `packages/ui`: shared UI primitives.
- `docker`: API, web, worker, PostgreSQL, Redis, and proxy definitions.

## Authentication and tenancy

Authentication is enforced server-side. Protected Studio, model, project, usage, and content endpoints remain private. Browser session renewal may retry an expired access token through the intended refresh mechanism; it must not expose tokens to URLs or relax endpoint visibility.

Every organisation-owned row and asset is accessed through an authenticated organisation context. Role and membership checks occur before tool execution, generation, publication, connector administration, or media delivery.

## Provider boundary

Provider credentials remain server-side. Runtime model capabilities and account pricing are refreshed from authenticated provider state. Model selection is capability-, policy-, quality-, and cost-aware. Missing capability, stale pricing, unavailable models, or missing price data fail closed.

## Queues and workers

BullMQ queues use Redis authentication and deterministic, provider-safe job identifiers. Submission and durable database state are reconciled so failed queue submission does not leave a false queued record. Workers support bounded concurrency, retry classification, idempotency, cancellation, heartbeat/health visibility, graceful shutdown, and credit reversal on terminal failure.

The generation worker handles provider-backed assets. The long-form still-motion worker converts a persisted still into local motion without reclassifying it as paid video. The render worker assembles scenes, narration, music, captions, transitions, thumbnail, and final media.

## Durable media

Provider URLs are inputs, not permanent client assets. Successful output required after job completion is validated and copied to organisation-owned durable storage. Database asset records preserve ownership, type, status, provenance, cost, and download/playback location. File type, size, SSRF, and organisation checks are enforced on ingestion and delivery.

## Database and migrations

PostgreSQL 16 with pgvector is authoritative. Applied migration files are immutable. Divergent production-applied filenames remain in the reconciled repository, unchanged; any repair is a new forward-only migration after the known tail. Both fresh migration and supported upgrade-path tests are release gates.

## Application Connector

The connector uses application ID/key identification, timestamped HMAC signatures, body integrity, replay protection, one-use SSO codes, origin validation, explicit product/service scopes, consented business snapshots, idempotent events, and failure isolation. See [Application Connector](APPLICATION_CONNECTOR.md).

## Safety boundary

Manual, Approval, and Autonomous modes share the same policies. Autonomous mode does not bypass credits, project budgets, channel allowlists, approval rules, publication limits, or Emergency Stop.
