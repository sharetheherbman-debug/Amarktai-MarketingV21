# EquiProfile Marketing — Source of Truth

**Status:** Canonical standalone Marketing application

The Amarktai Marketing repository is the sole source of truth for EquiProfile Marketing. It owns campaign planning, marketing materials, creative production, approvals, publishing, CRM, analytics, integrations, white-label identity, generation-credit governance, and owner-controlled automation. EquiProfile Core is deliberately a host product: it may expose an owner-only signed connector but must not embed, mirror, or evolve a second Marketing engine.

## Product boundary

| Concern | Canonical owner | Client result |
|---|---|---|
| Marketing Home, Business Brain, campaigns, Content Studio, Creative Studio, approvals, publishing, CRM, analytics, Connections, Usage & Safety | This repository | One Marketing workspace with shared business context and governed creation/publishing paths. |
| Marketing material lifecycle | This repository | Material records remain versioned and auditable; approvals and publishing are separate from generation. |
| Provider/model choices, quotes, credit reservations, settlement, ledger and Emergency Stop | This repository | No client is told a provider is live, a cost is final, or a release succeeded unless the relevant backend state confirms it. |
| White-label identity and custom domains | This repository | Owners can save customer-facing branding and add a domain, but a domain remains pending until DNS verification is recorded. |
| EquiProfile Core access | EquiProfile Core connector | Only the configured primary EquiProfile owner can request a short-lived signed Marketing launch. |

> **Boundary rule:** No authenticated user, tenant, campaign, content item, provider connection, or release record may be shared across organizations without the explicit application-connector contract and its authenticated, tenant-scoped API boundary.

## Owner-facing workflow

Marketing has a plain-language primary navigation focused on the owner journey. **Marketing Home** begins a reviewable Director planning cycle. **Business Brain** holds the business facts, brand voice, audiences, claims, visual identity, products and goals that campaign and material workflows reuse. **Campaigns** owns planning and version history. **Create** starts an ad, simple image, or short video without forcing raw tooling; Creative Studio continues to offer the detailed, quoted media workflow. **Approvals** and **Publish** remain explicit checkpoints. **Connections** reports real configured connection state rather than a simulated account. **Settings** now exposes the existing guarded white-label configuration and custom-domain verification APIs for owners.

The normal client must be treated as the product interface. A component, route, or generated asset is not release-ready merely because it exists in source; any new workflow must be created, saved, reloaded, and visibly reflected in its canonical state during acceptance.

## Operational governance

The application persists connection state, sync errors, model availability, quote/cost evidence, credit reservations, usage and release records. Incoming configuration is protected by organization membership at the integration route boundary. Owner/admin role checks protect privileged configuration, cost, automation and release operations. External provider calls are subject to availability and pricing gates; provider acceptance is never inferred from a green UI.

Publishing requires explicit destinations and retains delivery state. Autonomy is owner-controlled, subject to credit and approval policy, and can be stopped or released through the persisted Emergency Stop control. The production e2e provider stub is only a deterministic test boundary; it is not evidence that a paid provider is configured or ready in production.

## Connector and white-label contract

The EquiProfile connector is allowed to call only the signed Marketing SSO issue endpoint with a short-lived timestamped HMAC envelope. The redirect origin is checked against the configured Marketing application origin. Connector status and launch require the configured primary owner identity and a same-origin authenticated request; neither the connector key nor any provider credential belongs in the Core browser bundle.

White-label configuration is organization-scoped. A custom domain is normalised, must be public, and is inserted in `pending` DNS/SSL state. Verification records actual TXT or configured CNAME lookup evidence. The client only displays a verified state after the backend persists it; certificate provisioning remains distinct from DNS verification.

## Verification evidence

| Gate | Result | Evidence |
|---|---|---|
| Standalone verification suite | Passed: TypeScript, build, documentation, routes, database, security, branding and version checks | `audit/marketing-after-whitelabel-ui-verify.log` (handover workspace) |
| Standalone Marketing API suite | Passed: **32 suites, 202 tests** | `audit/marketing-api-tests.log` (handover workspace) |
| Patch integrity | Passed | `git diff --check` on the release branch |
| Public endpoint, read-only | Reachable at `/login`; branded Marketing login and MFA/recovery-code fields observed | `audit/production-endpoint-readonly-checks.md` (handover workspace) |

### Explicitly unrun live gates

The full real-backend Playwright journey was attempted with the deterministic external-provider stub and system Chromium. It correctly failed before a browser flow began because this sandbox has neither `DATABASE_URL` nor Docker available for the required disposable PostgreSQL/Redis/storage stack. That is recorded in `audit/marketing-real-browser-e2e.log` and `audit/marketing-e2e-prerequisites.txt` in the handover workspace. No paid provider acceptance was attempted and no production record was changed.

Before a production promotion, run the documented E2E stack with disposable services, then run owner-initiated and paid-provider acceptance only with an explicit authenticated session, a named capability, and a bounded positive credit ceiling. Do not place any session cookie, connector key, provider key, recovery code, or production `.env` value in this repository.

## Release procedure

1. Apply the normal release process on this branch after review. Use immutable, additive migrations only; do not edit production-applied migration files.
2. Provide the deployment environment’s existing secrets through its approved secret manager. Do not use committed configuration as a secret source.
3. Run the deterministic suite, clean database migration acceptance, real browser E2E with the provider stub, and the production read-only smoke check.
4. Enable the EquiProfile connector only when `MARKETING_CONNECTOR_ENABLED`, `MARKETING_APP_URL`, `MARKETING_API_URL`, `EQUIPROFILE_APP_ID`, `EQUIPROFILE_CONNECTOR_KEY`, and owner identity settings are configured in their respective deployment environments.
5. Treat the first live paid generation, social publish, or automation run as a separate owner-approved operation with documented maximum cost and a completion/delivery check.

The source branch is a **tested deployment candidate**, not a declaration that a database migration, external provider, social channel, or production deployment has completed.
