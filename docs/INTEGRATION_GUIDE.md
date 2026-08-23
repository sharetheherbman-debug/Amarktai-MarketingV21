# AmarktAI Marketing Integration Guide

## Purpose

AmarktAI Marketing has two separate integration surfaces:

1. **Application Connector** — trusted server-to-server integration between a host application and its Marketing workspace.
2. **Provider integrations** — user/owner-configured marketing destinations and data sources such as social, email, analytics, CMS, calendars and webhooks.

The two surfaces must not share deployment secrets or failure domains.

---

## Application Connector

The Application Connector is the reusable white-label integration for any trusted host application. EquiProfile Management is one host example; the protocol does not depend on EquiProfile-specific product names.

### Security contract

Signed requests use:

- `X-Application-Id`
- `X-Application-Key`
- `X-Application-Timestamp`
- `X-Application-Nonce`
- `X-Application-Signature`

`X-Application-Signature` is HMAC-SHA-256 over:

```text
timestamp + "\n" + nonce + "\n" + canonical-json-body
```

Canonical JSON recursively sorts object keys and preserves array order. Marketing rejects expired timestamps, invalid signatures, unknown/disabled connectors and replayed nonces.

Connector keys are server-side deployment secrets. They must never appear in browser bundles, repositories, logs or user-visible errors.

### Routes

All connector routes are rooted at `/api/v1/application-connectors`.

| Route | Signed | Purpose |
| --- | --- | --- |
| `POST /health` | Yes | Non-business-data connection/signing test. |
| `POST /sso/issue` | Yes | Issues a short-lived owner/admin SSO redirect. |
| `POST /sso/redeem` | No — one-time code | Redeems the browser-facing SSO code. |
| `POST /events/conversion` | Yes | Records an idempotent conversion/performance signal. |
| `POST /business-snapshot` | Yes | Stores a versioned authoritative host-business snapshot. |

### Failure isolation

Host applications should publish connector events **after** their own durable transaction commits. A Marketing outage or connector timeout must not reverse a host payment, entitlement, membership, order, fulfilment, access or account decision.

The SDK retries only retry-safe failures and re-signs every retry with a fresh nonce.

---

## Generic multi-product/service scope

`product_lines` is the canonical optional array of host-defined product/service scope keys.

Examples:

```json
{
  "product_lines": ["crm-pro", "consulting"]
}
```

or, for EquiProfile Management:

```json
{
  "product_lines": ["management"]
}
```

Rules:

- keys are normalized stable lowercase slugs;
- a campaign can target one scope, multiple scopes or remain unscoped;
- Marketing does not maintain a fixed global product enum;
- the legacy scalar `product_line` is compatibility-only and represents a campaign/event only when exactly one canonical scope exists;
- historical unclassified records are never silently assigned to a product;
- combined-scope prompts are required to keep facts/offers correctly attributed to the product they belong to.

The canonical scope is propagated through connector conversions, business snapshots, campaign plans, campaign asset runs, generation jobs, Growth Director opportunity selection, attribution and performance learning.

Migration `034_generic_multi_product_scope.sql` is additive and preserves legacy scalar data while introducing canonical JSON arrays. It must be applied through the normal controlled Marketing migration process after database backup and pre-deployment inspection.

---

## Business snapshots

A business snapshot is versioned by canonical payload fingerprint. An unchanged snapshot is idempotent rather than creating a new knowledge version.

The host can declare scope at the app level and on individual records:

```json
{
  "snapshot_id": "host-business-2026-08-22",
  "occurred_at": "2026-08-22T12:00:00.000Z",
  "app": {
    "id": "host-app",
    "name": "Host App",
    "domain": "example.com",
    "product_lines": ["crm-pro", "consulting"]
  },
  "products": [
    {"name": "CRM Pro", "product_line": "crm-pro"},
    {"name": "Consulting", "product_line": "consulting"}
  ],
  "authoritative_fields": ["products", "plans", "pricing", "features", "offers"]
}
```

Only current, approved business facts should be published as authoritative. Do not place passwords, API keys, payment details, health data or unrelated personal data in snapshots.

---

## Conversion and attribution events

Conversion events require:

- `event_id`
- `event_type`
- `occurred_at`
- `consent_basis`

`event_id` is unique per application so retries are idempotent. GBP value can be supplied as integer `value_pence` when relevant.

Use `properties.product_lines` for canonical multi-scope attribution. `properties.product_line` remains accepted for old single-scope clients.

Prefer pseudonymous or aggregate subject identifiers. A valid consent/legal basis must never be inferred or fabricated by Marketing.

---

## SDK

Use the server-side workspace package:

`@amarktai/application-connector-sdk`

Key methods:

- `testConnection()`
- `issueSso()`
- `publishConversion()` / `recordConversion()`
- `publishEvent()`
- `publishBusinessSnapshot()` / `recordBusinessSnapshot()`

The SDK enforces production HTTPS/secret requirements, request timeout, canonical signing, bounded retry/backoff and typed connector errors.

See [`packages/application-connector-sdk/README.md`](../packages/application-connector-sdk/README.md).

---

## Provider integrations

Provider integrations are configured independently from host Application Connectors. The repository contains integration routes/services for areas including:

- social publishing and performance sync;
- email delivery/provider configuration;
- CMS/web publishing;
- analytics/search data;
- calendars;
- inbound/outbound webhooks;
- import/export and external platform connections.

Availability of a specific live provider depends on its required OAuth/API credentials, provider-side approval and the current connection health state. The product must show an unavailable/needs-setup state rather than reporting false success when credentials are absent.

### Provider API surface

Common integration routes are under `/api/v1/integrations`, including provider discovery, connection management, connection testing, health, logs, webhooks and import/export.

External publishing remains subject to existing owner approval/control policies. A generated or approved Marketing asset is not proof that a third-party network accepted or published it.

---

## Deployment configuration

A host needs, at minimum:

- Marketing base URL;
- stable host application ID;
- strong connector key.

Marketing needs:

- `APPLICATION_CONNECTOR_SIGNING_SECRET`;
- the matching connector registry/configuration;
- its own DB/Redis/session configuration;
- provider-specific credentials only for providers that are intentionally activated.

Do not reuse Marketing database/session secrets in the host application.

Before activating a host connector:

1. deploy both exact approved SHAs;
2. run each service's health/readiness checks;
3. run the signed connector `testConnection()` path;
4. provision/redeem owner SSO;
5. publish a non-sensitive business snapshot;
6. send an idempotent test conversion;
7. verify Marketing receives the correct application and `product_lines` scope;
8. verify a simulated Marketing failure does not roll back the host transaction.

---

## References

- [Application Connector SDK](../packages/application-connector-sdk/README.md)
- [Application Connector routes](../apps/api/src/routes/application-connectors.ts)
- [Application Connector service](../apps/api/src/services/application-connector.service.ts)
- [Generic multi-product migration](../apps/api/src/db/migrations/034_generic_multi_product_scope.sql)
