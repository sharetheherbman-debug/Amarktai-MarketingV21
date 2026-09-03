# AmarktAI Marketing client handover — 2026-09-03

## Release identity

- Repository: `sharetheherbman-debug/Amarktai-MarketingV21`
- Branch: `chatgpt/final-client-handover-2026-09-02`
- Audited starting SHA: `e69a8b3ca1c216715dbcf448aeaaecfafa8b299a`
- Release-code SHA: `f1578041266c98e4fcb95b290832cae24245245c`
- The documentation commit follows the release-code SHA; use the final PR head for the complete handover tree.

## Product overview and architecture

This repository is the single standalone white-label Marketing engine. Branding, host application identity, connector origins, product/service scopes and lifecycle are tenant data or environment configuration. The engine supports EquiProfile, AmarktAI and future tenants without EquiProfile-specific branches in generic campaign logic.

PostgreSQL stores tenant state, approved knowledge, Company Brain snapshots, campaign/version/approval records and immutable financial/generation events. Redis-backed workers execute bounded asynchronous work. There are 46 ordered SQL migration files; migration history must remain append-only.

The canonical crawler is `knowledge-ingestion.service.ts`; the legacy crawler module is only an adapter. It validates public HTTP(S) destinations, pins public DNS results, bounds redirects/pages/depth/bytes/response size, honours robots rules, follows nested sitemaps, prioritises valuable pages, normalises canonical URLs, removes tracking parameters, suppresses duplicate URL/content, records partial failures, and reports rather than crawls unapproved linked domains.

Company Intelligence is resumable and owner-governed. Site approval, product scope and lifecycle are persisted before GenX review. Unchanged fingerprints reuse prior results; one explicit review produces one bounded quote/reservation path and malformed output cannot replace an approved snapshot. Marketing content, agents, planners and autonomous growth context all receive the selected generic product scopes.

GenX is the sole remote AI-generation boundary. Provider failure returns an honest unavailable/error response and leaves project state unchanged. Long-form storyboards no longer fall back to deterministic fake generated output. Stock media providers are licensed asset sources, not AI fallbacks.

## Environment and domains

The reusable default is `https://marketing.amarktai.co.za`; EquiProfile deployment configuration uses `https://marketing.equiprofile.online`. Required values are documented in `.env.example`: PostgreSQL, Redis, session/JWT/encryption secrets, GenX key/base/webhook values, public brand configuration, storage, connector trust and optional stock/social credentials. Never commit secret values.

SSO is a signed connected-application flow. Browser access is provisioned by an administrator or trusted host application; no embedded duplicate Core login is introduced.

## Verification evidence

Executed with Node 22 against the release-code tree:

- `npm run verify:types` — API, web and shared type checks PASS.
- `npm run lint` — PASS with 0 errors and 12 advisory warnings.
- `npm test --workspace=@amarktai/api -- --runInBand` — 53 suites, 296 passed, 0 failed.
- Focused crawler/Company Brain/isolation/lifecycle/GenX-boundary suite — 6 suites, 36 passed, 0 failed.
- `npm run verify` — TypeScript, production build, documentation, routes, database, security, branding and version all PASS.
- `npm run test:white-label-build` — AmarktAI, EquiProfile and Northstar future-tenant builds all PASS, sequentially.
- In-app Chromium acceptance of the EquiProfile-branded login at 1440×900, 768×1024 and 390×844 — correct title/copy, 0 horizontal overflow, 0 console errors.
- SSRF coverage — loopback, link-local, credentialed, non-HTTP and IPv6 loopback URLs rejected within the passing full suite.
- Changed-code whitespace check — PASS.

Local infrastructure limitations were reported, not hidden:

- `npm run test:migrations` could not start because `MIGRATION_FRESH_DATABASE_URL` and a disposable PostgreSQL service were unavailable.
- `npm run test:e2e` could not start the API because PostgreSQL/Redis were unavailable.
- Live autonomy/provider acceptance requires `LIVE_API_URL`, tenant/session IDs and bounded explicit paid-provider consent. No paid provider request was made.

CI must therefore be green on the final pushed SHA before release approval, especially its fresh/upgrade migration, real-backend Playwright, worker and security jobs.

## Administrator and deployment notes

Do not deploy from this task. For a reviewed release: back up PostgreSQL, validate both fresh and upgrade migration paths, deploy API/workers before web, verify Redis/storage, then test connected-application SSO, Company Brain persistence, Management/Academy/combined/coming-soon scope isolation, exact material approval and emergency stop. Roll back application artifacts first; retain compatible additive schema unless a database restore is explicitly approved.

Do not casually split the crawler, hard-code a host product, bypass site approval, change lifecycle into copy heuristics, allow client system prompts, reintroduce AI fallbacks, remove idempotency/credit reservations, or auto-publish without the exact governed approval state.

