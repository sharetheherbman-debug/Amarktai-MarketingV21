# Host Application Integration

## Purpose

AmarktAI Marketing is a standalone marketing product. A host application integrates with it through the server-side **Application Connector**; the Marketing application is not copied into, embedded inside, or coupled to the host application's database or authentication implementation.

The connector is white-label and host-neutral. EquiProfile is the first supported host, but the protocol accepts a deployment-defined application identity and host-defined product/service scope keys.

## Architecture boundary

A correct integration has four boundaries:

1. **Host business transaction** — the host remains authoritative for orders, subscriptions, memberships, entitlements, products, learning, or other domain state.
2. **Post-commit publisher** — after the host transaction commits, the host may publish an approved marketing-safe event or business snapshot.
3. **Application Connector** — server-to-server HMAC authentication delivers SSO issue requests, conversion signals, business snapshots, and health checks.
4. **Marketing workspace** — Marketing stores its own campaign, attribution, content, automation, and business-knowledge state in its own PostgreSQL/Redis deployment.

A Marketing delivery failure must never roll back or invalidate an already committed host business transaction.

## Canonical package

Use `packages/application-connector-sdk` from a trusted server-side runtime.

```ts
import { ApplicationConnectorClient } from '@amarktai/application-connector-sdk';

const marketing = new ApplicationConnectorClient({
  baseUrl: process.env.MARKETING_BASE_URL!,
  applicationId: process.env.HOST_APP_ID!,
  connectorKey: process.env.HOST_APP_CONNECTOR_KEY!,
});
```

Never instantiate the SDK in browser/client code and never expose `HOST_APP_CONNECTOR_KEY` through a public environment variable.

## Marketing deployment configuration

Marketing requires explicit production configuration. The current environment-managed connector supports one primary host connector per deployment.

Required connector values:

- `HOST_APP_ID` — stable lowercase slug, for example `client-portal`.
- `HOST_APP_NAME` — human-readable host name.
- `HOST_APP_URL` — canonical HTTPS host URL.
- `HOST_APP_CONNECTOR_KEY` — shared connector key, minimum 32 characters.
- `APPLICATION_CONNECTOR_SIGNING_SECRET` — Marketing-side secret used when hashing the connector key before storage, minimum 32 characters.

For the first EquiProfile deployment only, `EQUIPROFILE_APP_ID`, `EQUIPROFILE_APP_NAME`, `EQUIPROFILE_APP_URL`, and `EQUIPROFILE_CONNECTOR_KEY` remain accepted compatibility aliases. New integrations must use the `HOST_APP_*` names.

Production configuration fails closed when the host identity, URL, or connector secrets are absent or insecure. Production host URLs must use HTTPS.

## Signed request protocol

All SDK server-to-server routes are rooted at:

`/api/v1/application-connectors`

Signed requests send:

- `X-Application-Id`
- `X-Application-Key`
- `X-Application-Timestamp`
- `X-Application-Nonce`
- `X-Application-Signature`
- `Content-Type: application/json`

The signature is HMAC-SHA-256 over:

`timestamp + "\n" + nonce + "\n" + canonical-json-body`

Canonical JSON recursively sorts object keys and preserves array order. Marketing verifies the connector identity/key, timestamp window, signature and one-time nonce before processing the request.

## Health check

Call `marketing.testConnection()` after configuration and before enabling event delivery. It verifies the signed connector path without mutating host business state.

A successful response reports:

- `connected: true`
- `application_id`
- `application_name`
- `connector_version`

## SSO flow

Only host users asserted as `admin` or `superadmin` may request Marketing SSO.

Server side:

```ts
const result = await marketing.issueSso({
  external_user_id: hostAdmin.id,
  email: hostAdmin.email,
  display_name: hostAdmin.name,
  external_role: 'admin',
  target_path: '/dashboard',
});

return redirect(result.data.redirect_url);
```

The issue endpoint creates a short-lived one-time code. The browser redeems that code on Marketing. Marketing places access and refresh credentials in `HttpOnly`, production-`Secure`, `SameSite=Lax` cookies; the browser application does not persist JWT credentials in `localStorage`.

Workspace provisioning is deterministic and least-privilege:

- first authorized host administrator for a new Marketing workspace becomes workspace `owner`;
- later authorized host administrators become workspace `admin`;
- an existing owner is never downgraded by a later SSO redemption;
- the owner decision is serialized so concurrent first-time redemptions cannot create multiple owners.

Marketing MFA remains mandatory. A new SSO user is routed through MFA enrollment before normal dashboard access.

## Product/service scopes

`product_lines` is the canonical multi-scope field. Scope keys are host-defined lowercase slugs matching:

`^[a-z0-9][a-z0-9_-]{0,63}$`

Examples:

- `crm-pro`
- `consulting`
- `premium-membership`

A host may publish one scope, several scopes, or no scope. The historical scalar `product_line` is compatibility-only and is meaningful when exactly one scope is present.

Do not create customer-specific enums in Marketing. Keep host scope keys stable after release because they become durable attribution/campaign dimensions.

## Integration sequence

For a new host deployment:

1. Generate independent connector/signing secrets through the deployment secret manager.
2. Configure Marketing `HOST_APP_*` values and `APPLICATION_CONNECTOR_SIGNING_SECRET`.
3. Configure host `MARKETING_BASE_URL`, `HOST_APP_ID`, and the matching `HOST_APP_CONNECTOR_KEY`.
4. Deploy/restart Marketing so the environment-managed connector registry is reconciled.
5. Run signed health.
6. Complete SSO as an authorized host administrator and finish MFA enrollment.
7. Publish a minimal business snapshot.
8. Publish one idempotent test conversion.
9. Repeat the same conversion `event_id` and verify it is reported as a duplicate rather than stored twice.
10. Verify an invalid signature and replayed nonce are rejected.
11. Verify prohibited sensitive fields are rejected.
12. Only then enable normal post-commit publishing.

## Operational ownership

The host owns business correctness and the decision to publish. Marketing owns connector verification, campaign/attribution state, and data-minimization enforcement at its boundary. Both sides should log correlation/event IDs but neither side may log connector keys, HMAC secrets, JWTs, card data or private host-domain data.

See also:

- `HOST_APP_SECURITY.md`
- `HOST_APP_EVENT_CONTRACT.md`
- `HOST_APP_QUICKSTART.md`
- `packages/application-connector-sdk/README.md`
