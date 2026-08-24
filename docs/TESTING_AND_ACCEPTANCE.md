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
```

Also run clean fresh-database migrations, the supported production-history upgrade fixture, web tests where configured, real browser E2E, Docker builds, and Compose validation. Record every command, exit status, counts, warnings, and skipped gate.

## Browser acceptance

Browser E2E uses the real API, a disposable database, real session cookies, queues, and durable test storage. Provider calls may use explicit deterministic adapters in ordinary CI; the backend/database/queue/storage flow must not be replaced by page-only mocks.

The suite covers:

- login, session persistence/refresh, logout, and protected routes;
- every primary client navigation route at desktop, tablet, and mobile widths;
- Command Centre real API data and quick actions;
- Business Brain edit/save/reload;
- research creation and durable viewing;
- campaign create/save/open/update;
- Content Studio durable generation/revision/reload;
- Creative Studio authenticated model catalogue, submission, history, and asset persistence;
- long-form project, script, storyboard, scenes, quote, explicit production classification, deterministic/local render, final durable output;
- credit reserve, settle, and failure release;
- approval, rejection, revision, and exact-version invalidation;
- Settings and Usage & Safety load/save;
- signed connector fixtures, one-use SSO, snapshots, events, and failure isolation.

## Migration acceptance

Production-applied migration files are checksum-immutable. A fresh database must reach the current schema. The supported upgrade fixture contains the known 40-entry production journal, including both divergent `033`/`034` files and `035`; it must apply only new forward migrations. Missing, altered, duplicate, reordered, partial, or unknown history fails closed.

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
