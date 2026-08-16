# EquiProfile Marketing — Phase 1 Relaunch Contract

## Canonical repository and branch

- Repository: `sharetheherbman-debug/Amarktai-MarketingV21`
- Phase 1 branch: `phase-1/equiprofile-relaunch-genx-credits`
- Branch starting commit: `f5d30902570b64dd20fb895c173a45a46f8eb6b7`
- Production domain: `marketing.equiprofile.online`

The branch is isolated from EquiProfile production and from the existing open Phase 5 pull request while the relaunch work is validated.

## Product shape

The codebase is white-label and reusable, but each connected deployment/workspace represents one application, one business and one brand.

The first configured application is:

- application ID: `equiprofile`
- application name: `EquiProfile`
- primary domain: `equiprofile.online`
- marketing domain: `marketing.equiprofile.online`
- market and billing currency: United Kingdom / GBP

EquiProfile-specific values are configuration, not hard-coded platform behaviour.

## GenX-only AI policy

- GenX is the sole remote AI provider.
- The GenX API key exists only in the server environment.
- Customers never enter or view the GenX key.
- No provider-selection or provider-key settings are shown to a workspace user.
- Qwen, Hugging Face, Together, DeepInfra and OpenAI fallback routing are removed from the production runtime.
- Failed GenX work is retried or reported honestly; it is never replaced with fabricated AI success.

Local deterministic infrastructure such as PostgreSQL search, FFmpeg, storage and image processing remains permitted.

## GBP Generation Credits

All customer billing and reporting is in pounds sterling.

Customer convention:

- 100 Generation Credits = GBP 1.00 retail generation value
- Starter: 1,000 credits for GBP 10
- Growth: 2,500 credits for GBP 25
- Campaign: 5,000 credits for GBP 50
- Scale: 10,000 credits for GBP 100

Credits cover text, image, voice, audio, avatar and video work even when the underlying GenX billing unit is not a text token.

### Pricing

- authenticated GenX model/job pricing is the wholesale source
- the agent-tier discount is retained by the platform
- default target gross margin is 40%
- model prices are converted to GBP and snapshotted
- unpriced or unverified models remain unavailable
- every generation records wholesale cost, retail charge and gross profit

### Wallet controls

The wallet uses an immutable ledger with atomic reservation and settlement.

- reserve before submitting a generation
- settle against actual GenX usage/cost
- release unused credits
- failed/no-cost jobs release the reservation
- autonomous workers cannot create a negative balance

### Platform-admin credit controls

A platform administrator may:

- grant free credits
- grant promotional credits
- fund an internal workspace
- add credits at an explicitly recorded wholesale/Stripe cost basis

All grants create immutable ledger and audit records. EquiProfile's internal relaunch workspace uses the same metering system without paying itself through Stripe.

## Stripe

Customer top-ups use one-time Stripe Checkout payments in GBP.

Credits are issued only from a verified, idempotent Stripe webhook. Browser redirects alone never credit a wallet.

Refunds and chargebacks create compensating ledger entries; existing ledger entries are never edited or deleted.

## Settings ownership

The workspace Settings area contains only business-controlled marketing connections and policy:

- social account connections and OAuth
- advertising account connections
- email sending/marketing account connection
- analytics connections
- brand profile and assets
- publishing permissions
- approval rules
- campaign and credit budgets
- auto-recharge controls
- host-application connector status

The Settings area does not contain:

- GenX API key or provider selection
- Stripe secret/webhook keys
- database or Redis credentials
- SMTP infrastructure password
- JWT/encryption secrets
- VPS, TLS or backup credentials

Platform infrastructure is configured through the VPS environment.

## Autonomous machine boundary

Marketing runs as its own service with its own PostgreSQL/pgvector database, Redis queues, workers, sessions and audit logs.

It may autonomously operate connected accounts only within explicit rules:

- approved organic publishing mode
- approved platforms and accounts
- daily/campaign/monthly generation budgets
- daily/campaign advertising spend ceilings
- email compliance and send limits
- emergency pause controls
- immutable execution and cost records

A separate application connector key allows EquiProfile or another owned application to send signed conversion events and request short-lived administrator SSO. Social platforms still use their own OAuth/access-token mechanisms; one generic API key cannot replace platform authorisation.

## Relaunch Control Centre

The Marketing app must contain a reusable Relaunch Control Centre that can:

1. audit the connected application's readiness
2. define offer, audience, date and budget
3. generate launch text and media
4. build countdown, launch and post-launch schedules
5. request or record approval
6. publish through connected accounts
7. start approved paid campaigns
8. track visits, registrations, activation and paid conversions
9. pause all publishing, email or paid activity
10. feed measured results into the next growth cycle

The first configured relaunch is EquiProfile, but the feature must work for future owned applications through configuration.

## Phase 1 implementation status

Committed on this branch:

- GenX-only provider router
- GBP commercial environment policy
- GBP credit wallet, purchases, reservations, immutable ledger and model-price schema
- atomic wallet/grant/reservation/settlement service
- platform-admin free, at-cost, promotion and internal-funding credit API controls

Code-level release completion on 11 August 2026:

- root/public product/signup routes redirect to secure owner login and public API registration is disabled;
- one application provisions exactly one workspace owner through the signed connector;
- password and connector SSO flows require independent Marketing TOTP before a full session or refresh token;
- TOTP includes QR/manual enrollment, encrypted secrets, verification-before-enable, hashed one-use and regenerable recovery codes, replay counters, rate limits and audit events;
- EquiProfile white-label metadata, auth/dashboard shells and `© 2026 Amarktai Network` attribution are applied;
- the dashboard reads live Control Centre, Generation Credit, campaign, connection and GenX capability state and never invents missing data;
- team, agency, marketplace, customer billing and other deferred surfaces are outside launch navigation while reusable structures remain intact;
- customer Marketing checkout is absent from the Phase 1 UI; the internal wallet/ledger and promotional grants remain;
- neutral `HOST_APP_*` connector variables work with backwards-compatible `EQUIPROFILE_*` aliases;
- campaign planning now saves a structured, versioned strategy and requires owner approval before coordinated asset production;
- Content Studio supports grounded generation, deterministic quality checks, autosave, version comparison/restoration, duplication, comments and targeted revision;
- each text or media asset uses an isolated, governed run so partial failure can be retried without replacing or charging successful siblings;
- text input/output and media operations reserve and settle Generation Credits against immutable authenticated GenX price snapshots;
- execution approvals bind exact payloads, expire, recheck current policy and Emergency Stop, and write immutable decision/audit transitions;
- API/web builds, repository verification, 129 API regressions and unauthenticated desktop/mobile browser acceptance pass.

Still required as controlled deployment acceptance: real GenX generation, social publication, email delivery, analytics synchronisation, VPS workers/queues, canonical DNS/TLS, backup/restore evidence, authenticated owner browser/PWA testing and the Management production connector.

See `docs/PHASE_1_RELEASE_READINESS.md` for the consolidated truth matrix and `docs/CAMPAIGN_INTELLIGENCE_AND_STUDIO_ACCEPTANCE.md` for creative-quality and isolated end-to-end acceptance.

This document is the binding Phase 1 implementation contract unless explicitly revised.
