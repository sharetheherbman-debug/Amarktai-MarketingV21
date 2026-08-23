# Host Application Event Contract

## Scope

This document defines the durable host-to-Marketing data contract for conversion events and business snapshots. The connector is generic: event names and product/service scopes belong to the host domain, while Marketing enforces transport, idempotency, privacy and shape constraints.

All signed routes are rooted at `/api/v1/application-connectors`.

## Conversion events

Endpoint:

`POST /events/conversion`

### Required fields

| Field | Type | Rules |
| --- | --- | --- |
| `event_id` | string | Stable logical event ID. Reuse the same ID when retrying the same business event. |
| `event_type` | string | Host-defined durable event name. |
| `occurred_at` | ISO date string | Must parse as a valid date. |
| `consent_basis` | enum | `contract`, `consent`, `legitimate_interest`, or `anonymous_aggregate`. |

### Optional fields

| Field | Type | Rules |
| --- | --- | --- |
| `external_user_id` | string | Prefer an opaque stable host identifier, not email/phone. |
| `external_organization_id` | string | Host organization/account reference. |
| `value_pence` | integer | Non-negative integer. |
| `currency` | literal | Currently `GBP` only; omitted values are treated as GBP. |
| `properties` | object | Marketing-safe attribution/context only. Sensitive/private fields are rejected. |

### Product/service scope

Put canonical scopes inside `properties.product_lines`:

```json
{
  "product_lines": ["crm-pro", "premium-support"]
}
```

For legacy one-scope publishers, `properties.product_line` remains accepted.

Scope keys are normalized to lowercase and must match:

`^[a-z0-9][a-z0-9_-]{0,63}$`

At most 32 canonical scopes may be supplied by normalization-aware campaign endpoints. Host integrations should use a small stable scope vocabulary rather than generating transient per-event keys.

### Idempotency

Database uniqueness is `(application_id, event_id)`.

- first accepted event: HTTP `201`, `{ accepted: true, duplicate: false }`;
- same logical event ID again: HTTP `200`, `{ accepted: true, duplicate: true }`.

A signing nonce is independent of `event_id`. Every network attempt needs a fresh timestamp/nonce/signature even when the event ID remains the same.

### Derived attribution

A newly accepted conversion can create a corresponding Marketing performance event and change signal when the connector already has a provisioned Marketing workspace. Multi-scope context is preserved in `product_lines`; the legacy scalar is populated only when exactly one scope exists.

### Recommended event naming

Use stable past-tense or state-transition names tied to host facts, for example:

- `registration_completed`
- `subscription_started`
- `subscription_payment_received`
- `plan_changed`
- `product_published`
- `availability_changed`
- `product_viewed`
- `checkout_started`
- `order_paid`

These are examples, not hard-coded Marketing enums.

## Business snapshots

Endpoint:

`POST /business-snapshot`

A snapshot represents approved current business knowledge that Marketing may use to ground campaign planning/generation.

### Required fields

```json
{
  "snapshot_id": "snapshot-2026-08-23T07:00:00Z",
  "occurred_at": "2026-08-23T07:00:00.000Z",
  "app": {
    "id": "client-portal",
    "name": "Client Portal",
    "domain": "client.example.com"
  }
}
```

Rules:

- `snapshot_id`, `occurred_at`, `app.id`, `app.name`, and `app.domain` are required;
- `app.id` must exactly match the authenticated `X-Application-Id`;
- `occurred_at` must be a valid date;
- canonical serialized snapshot must not exceed 1 MB;
- a Marketing workspace must already have been provisioned through authorized SSO.

### Optional business collections

The snapshot may include:

- `products`
- `plans`
- `pricing`
- `features`
- `offers`
- `promotions`
- `status_changes`
- `authoritative_fields`

Each record may carry `product_line` or `product_lines` using the same generic slug rules.

Publish only approved business facts. Private people/learning/health/payment/supplier-cost fields are rejected or prohibited by the security boundary.

### Versioning and duplicates

Marketing canonicalizes the complete snapshot and calculates a fingerprint.

- if the fingerprint equals the current snapshot, Marketing returns the current version with `duplicate: true` and no material change;
- if content differs, the old current row is retired, the version increments, and the new snapshot becomes current;
- a material structured-business-change signal is recorded for downstream Marketing intelligence.

## Sensitive-field rejection

Before conversion properties or a business snapshot are stored, Marketing recursively rejects prohibited keys. Typical rejection response code:

`CONNECTOR_SENSITIVE_FIELD_REJECTED`

Do not send direct contact/address fields, credentials/tokens, payment/card/bank fields, health/veterinary records, learner progress/teacher feedback/tutor chats, or private supplier cost fields.

## Error semantics

Important connector errors include:

| Code | Meaning | Retry? |
| --- | --- | --- |
| `APPLICATION_REPLAY_DETECTED` | Signing nonce already consumed. | Re-sign only if the logical operation itself is safe to retry. |
| `CONVERSION_EVENT_INVALID` | Missing/invalid required conversion field. | No; fix payload. |
| `CONVERSION_CURRENCY_INVALID` | Currency is not GBP. | No; fix payload. |
| `CONVERSION_VALUE_INVALID` | `value_pence` invalid. | No; fix payload. |
| `BUSINESS_SNAPSHOT_INVALID` | Required snapshot identity/date invalid. | No; fix payload. |
| `BUSINESS_SNAPSHOT_APP_MISMATCH` | Snapshot app ID differs from authenticated application. | No; fix configuration/payload. |
| `BUSINESS_SNAPSHOT_TOO_LARGE` | Canonical snapshot exceeds 1 MB. | No; reduce payload. |
| `MARKETING_WORKSPACE_REQUIRED` | SSO workspace not provisioned yet. | After provisioning. |
| `PRODUCT_SCOPE_INVALID` | Scope key violates slug rules. | No; fix scope vocabulary. |
| `CONNECTOR_SENSITIVE_FIELD_REJECTED` | Prohibited private/sensitive field present. | No; remove field. |
| `CONNECTOR_PAYLOAD_TOO_DEEP` | Excessive recursive nesting. | No; simplify payload. |

The SDK retries only retry-safe transport/server classes such as network errors, HTTP `408`, `429`, and `5xx`, with bounded exponential delay. Application validation errors fail immediately.

## Host publishing rule

Publish only after the host's authoritative transaction commits. If delivery fails, retain/retry through a host outbox or operational queue if required; do not undo the host transaction because Marketing is unavailable.

## Acceptance examples

A complete integration test should prove:

1. one valid conversion is accepted;
2. replaying the same `event_id` is idempotent;
3. replaying the same signing nonce is rejected;
4. a two-scope event keeps both scopes;
5. an invalid scope is rejected;
6. an email/token/card/veterinary/teacher-feedback/supplier-cost property is rejected;
7. an initial snapshot becomes version 1;
8. the identical snapshot is a duplicate;
9. a changed approved snapshot becomes version 2;
10. an app-ID mismatch is rejected;
11. host business success remains committed even when Marketing delivery is unavailable.
