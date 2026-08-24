# Application Connector

## Purpose

The Application Connector allows any host product to integrate with AmarktAI Marketing without database sharing or product-specific source changes. EquiProfile is deployment #1 and supplies its identity, branding, products/services, and approved business data through configuration.

The canonical API prefix is `/api/v1`. Browser and server clients must normalise the API base centrally; production must never require a manually rebuilt frontend to repair `/api` versus `/api/v1`.

## Security contract

Signed requests include the application identifier/key, timestamp, signature, and body integrity required by the SDK. The server validates:

- known enabled application;
- constant-time signature comparison;
- configured secret strength;
- timestamp freshness;
- replay/nonce uniqueness;
- origin/redirect allowlist;
- organisation and user eligibility;
- product/service scope and consent;
- payload boundary and idempotency.

Secrets are server-side only. Browser code receives neither connector keys nor shared HMAC material.

## SSO

The host requests a short-lived one-use code through the signed server channel. The browser opens the configured Marketing SSO redemption route. Marketing validates the code, host, origin, expiry, use state, role eligibility, and target before creating its own secure session. Invalid, expired, reused, cross-origin, or unauthorised codes fail closed.

## Business snapshot

A snapshot may contain only approved business/product/service knowledge needed for marketing context. It is explicitly scoped, versioned, attributable to the host, and isolated from unrelated host records. Payment data, secrets, health records, private learning records, and other prohibited fields are rejected.

## Events and conversions

The host sends allow-listed, consented, idempotent events. Marketing records accepted events durably for attribution and optimisation. Connector unavailability does not block the host’s primary transaction; failures are visible and safely retryable.

## SDK

Use `packages/application-connector-sdk` from the host server. The SDK owns canonical headers, signing, `/api/v1` route construction, timeouts, and idempotency. Do not duplicate signing logic in a browser or customer-specific component.

## Acceptance

Release acceptance covers valid SSO, one-use redemption, invalid/expired/replay rejection, origin validation, owner/admin behaviour, snapshot boundaries, conversion delivery, idempotency, and failure isolation.
