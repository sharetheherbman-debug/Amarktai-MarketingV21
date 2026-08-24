# Testing and acceptance

## Deterministic release gate

Run from a clean checkout with Node.js 22 and disposable PostgreSQL/Redis/media storage:

```bash
npm ci
npm run lint
npm run build
npm run test --workspace=@amarktai/api
npm run verify
npm run audit
npm run build --workspace=@amarktai/application-connector-sdk
npm run test:migrations
npm run test:e2e
npm run test:white-label-build
```

Also run clean fresh-database migrations, the supported production-history upgrade fixture, web tests where configured, real browser E2E, Docker builds, and Compose validation. Record every command, exit status, counts, warnings, and skipped gate.

## Browser acceptance

Browser E2E uses the real API, a disposable database, real session cookies, queues, and durable test storage. Provider calls may use explicit deterministic adapters in ordinary CI; the backend/database/queue/storage flow must not be replaced by page-only mocks.

The real-backend Playwright suite covers:

- login, session persistence/refresh, logout, and protected routes;
- primary client navigation routes at desktop and mobile widths;
- Command Centre real API data;
- Business Brain edit/save/reload;
- Research & Intelligence authenticated loading;
- campaign create/save/open/update;
- Content Studio, Approvals and Publishing authenticated loading;
- Creative Studio authenticated runtime capability visibility and access-cookie refresh/retry;
- long-form project, Smart/Hybrid strategy, 60-second scene and in-budget quote without provider execution;
- CRM, Analytics, Marketing Team, Connections, Settings and Usage & Safety loading;
- real Emergency Stop activation and release;
- white-label build identity and absence of Cinema asset requests.

No Marketing API route is mocked in the browser. CI replaces only the external GenX HTTP boundary and still runs the real API, PostgreSQL, Redis, session middleware and persistence services.

## Migration acceptance

Production-applied migration files are checksum-immutable. `npm run test:migrations` requires two explicitly named disposable databases. One runs every repository migration twice. The other is built by the real migrator through `035`, then runs the unmodified production history plus `036`, then runs again. The script verifies that only `036` was added, historical checksums/timestamps were unchanged, both second runs were no-ops, and the forward schema/index/constraints exist. It never inserts migration journal rows directly.

## Owner-initiated autonomy acceptance

After deployment, set `LIVE_API_URL`, `LIVE_ORGANIZATION_ID`, `LIVE_SESSION_COOKIE`, and a positive `LIVE_MAX_CREDITS`, then run:

```bash
npm run acceptance:autonomy -- "Create a complete launch campaign for the Academy, obey approvals and the explicit Generation Credit ceiling."
```

Optional `LIVE_PRODUCT_LINES` is a comma-separated scope and `LIVE_AUTONOMY_IDEMPOTENCY_KEY` pins replay protection. The command creates one owner/admin cycle through the authenticated product API, prints transitions and associated campaign/content/generation/asset IDs, and ends with `AUTONOMY_ACCEPTANCE_REPORT=...`. It stops truthfully at owner review in non-autonomous governance modes. The exact session cookie must remain outside tracked files and shell history.

## Long-form regression gates

- production mode is persisted explicitly;
- `source_image_url` never reclassifies still-motion as paid AI video;
- retry reuses a valid generated still and only repeats local render;
- quote includes all required priced components and hard project ceiling;
- stale/missing pricing, insufficient wallet, or active Emergency Stop blocks generation;
- retries do not duplicate reservation, provider billing, settlement, or durable assets;
- final MP4, thumbnail, captions, playback, and download survive refresh;
- `16:9`, `9:16`, and `1:1` render fixtures pass.

## Opt-in provider acceptance

Ordinary CI never calls paid providers. The documented live command requires explicit credentials, a named capability, and a maximum cost. It prints the quote and exits before submission unless the quote is complete, fresh, and within the supplied ceiling.

Run `npm run acceptance:provider -- <check>` with `text`, `image`, `short-video`, `audio-voice`, `advert-30`, or `longform-60`. Supply `LIVE_API_URL`, `LIVE_ORGANIZATION_ID`, `LIVE_SESSION_COOKIE`, and `LIVE_MAX_CREDITS`. Generic checks also require `LIVE_MODEL_ID`, `LIVE_OPERATION`, `LIVE_QUANTITY`, and `LIVE_REQUEST_JSON`; long-form requires `LIVE_LONGFORM_PROJECT_ID`. Submission additionally requires the exact opt-in value `LIVE_PROVIDER_ACCEPTANCE=I_ACCEPT_PAID_PROVIDER_COSTS`. Keep the session cookie out of tracked files and shell history.

Individually gated checks cover text, image, short video, audio/voice, a 30-second advert/reel, and a 60-second Smart/Hybrid long-form project. Results record provider/model, estimate, actual credits, assets, duration/probe, persistence, and ledger reconciliation without logging secrets.

## Acceptance truth

A deterministic provider adapter proves product plumbing, not live provider availability or creative quality. A source-string assertion proves a contract, not a browser workflow. A green build alone is not handover acceptance.
