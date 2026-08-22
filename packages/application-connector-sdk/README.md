# Application Connector SDK

This package is the reusable **host-application client** for AmarktAI Marketing’s Application Connector protocol. It is intentionally white-label: a host identifies itself through deployment configuration and does not need to implement a product-specific signing scheme.

## Security contract

Every signed request sends these headers:

| Header | Purpose |
| --- | --- |
| `X-Application-Id` | Stable host-application identifier. |
| `X-Application-Key` | Connector key supplied only through the host deployment environment. |
| `X-Application-Timestamp` | Unix timestamp in seconds; requests outside the Marketing clock-skew window are rejected. |
| `X-Application-Nonce` | One-time URL-safe nonce; replayed nonces are rejected. |
| `X-Application-Signature` | HMAC-SHA-256 over `timestamp + "\n" + nonce + "\n" + canonical-json-body`. |

The canonical JSON body recursively sorts object keys and preserves array order. The connector key must never be put in browser code, a client bundle, a commit, a log, or a user-facing error message.

## Host integration

```ts
import { ApplicationConnectorClient } from '@amarktai/application-connector-sdk';

const marketing = new ApplicationConnectorClient({
  baseUrl: process.env.MARKETING_BASE_URL!,
  applicationId: process.env.HOST_APP_ID!,
  connectorKey: process.env.HOST_APP_CONNECTOR_KEY!,
});

await marketing.recordConversion({
  event_id: crypto.randomUUID(),
  event_type: 'subscription_started',
  occurred_at: new Date().toISOString(),
  external_organization_id: 'org_123',
  consent_basis: 'contract',
  properties: {
    product_line: 'subscriptions',
    entity_type: 'subscription',
  },
});
```

A host should call the SDK only from a trusted server-side, post-commit boundary. Connector delivery is best-effort: a Marketing outage must not reverse an order, subscription, membership, access decision, or other host transaction.

## Canonical endpoints

All routes are rooted at `/api/v1/application-connectors`.

| Method and path | Authentication | Result |
| --- | --- | --- |
| `POST /sso/issue` | Signed | Creates a short-lived Marketing SSO redirect for a host `admin` or `superadmin`. |
| `POST /sso/redeem` | One-time code | Redeems a browser-facing SSO code. This endpoint is intentionally not SDK-signed. |
| `POST /events/conversion` | Signed | Stores an idempotent, GBP-denominated conversion signal. |
| `POST /business-snapshot` | Signed | Stores a versioned current business-knowledge snapshot. |

`recordConversion` and `recordBusinessSnapshot` return HTTP `201` for a new event and `200` for an idempotent duplicate. A `409 APPLICATION_REPLAY_DETECTED` means the nonce was already used and the host must create a new signed request rather than retrying headers.

## Product-line scope and consent

`product_line` is optional context, not a brand or tenant credential. Hosts should use a stable lowercase product scope and must match the values permitted by their Marketing deployment. Conversion payloads require an explicit `consent_basis`; hosts must not invent consent or transfer direct identifiers unless the basis and data-minimization rules allow it.

## Deployment configuration

The host provides `MARKETING_BASE_URL`, `HOST_APP_ID`, and `HOST_APP_CONNECTOR_KEY` during controlled deployment. Marketing validates its connector registry using `APPLICATION_CONNECTOR_SIGNING_SECRET` and its corresponding host connector configuration. No deployment secret is included in this package.

## Verification

Build the SDK with:

```bash
npm run build --workspace=@amarktai/application-connector-sdk
```

The Marketing API’s connector contract tests verify that the SDK continues to use the exact canonical headers, sorted JSON signature convention, route root, and replay-safe request shape.
