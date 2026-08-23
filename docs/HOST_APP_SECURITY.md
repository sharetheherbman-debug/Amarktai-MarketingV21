# Host Application Security

## Security objective

The Application Connector permits a trusted host server to supply narrowly scoped marketing facts and to issue administrator SSO handoffs without sharing either application's database, session store, or general API credentials.

The security model is **deny by default**: a request must pass connector authentication, replay protection, schema/domain validation and the data-minimization boundary before Marketing stores or acts on it.

## Trust boundaries

### Server-to-server connector

Connector secrets belong only in trusted server-side secret storage. They must never appear in:

- browser JavaScript;
- `NEXT_PUBLIC_*` or other public build variables;
- source control;
- logs or traces;
- support screenshots;
- error messages;
- analytics payloads.

### Browser session

Marketing browser sessions use `HttpOnly` cookies. In production they are `Secure` and `SameSite=Lax`.

- access cookie lifetime: 15 minutes;
- refresh cookie lifetime: 7 days;
- browser code does not persist access or refresh JWTs in `localStorage`;
- dashboard entry is revalidated against `/auth/me`;
- MFA is required before normal authenticated application access.

Bearer access tokens remain accepted by API middleware for controlled non-browser compatibility, but the shipped browser application does not use a JavaScript-readable bearer-token session.

## Request authentication

A signed connector request carries application ID, connector key, Unix timestamp, nonce and HMAC signature.

The signature message is:

`timestamp + "\n" + nonce + "\n" + canonical-json-body`

Marketing verifies:

1. application exists and is active;
2. supplied connector key hashes to the stored key hash;
3. timestamp is within the configured clock-skew window (default 300 seconds);
4. nonce syntax is valid;
5. HMAC signature matches using timing-safe comparison;
6. nonce has not already been used.

A replayed nonce fails with `APPLICATION_REPLAY_DETECTED`.

The database stores a hash of the connector key, not plaintext connector credentials.

## Transport security

Production Marketing and host application URLs must use HTTPS. TLS termination/proxy configuration must preserve HTTPS externally even when an internal reverse-proxy hop is HTTP.

Do not send connector requests directly to an unencrypted public HTTP endpoint.

## Runtime and dependency baseline

Production application images use the supported Node.js 22 LTS line. The pull-request pipeline regenerates the npm lockfile from reviewed direct-dependency pins, runs TypeScript/tests/builds on that locked graph, and rejects high-severity `npm audit` findings before a candidate may be frozen.

Security-sensitive direct upload middleware is pinned to the maintained Multer 2.2.0 line with matching TypeScript declarations. Dependency upgrades are accepted only after the complete release pipeline passes on the resulting exact commit SHA.

## Secret requirements and rotation

Production connector/signing secrets must be at least 32 characters and must not use placeholder values.

Current environment-managed rotation procedure:

1. generate a new high-entropy connector key;
2. update the host secret store and Marketing `HOST_APP_CONNECTOR_KEY` in one controlled change window;
3. restart/redeploy Marketing so the connector registry receives the new key hash;
4. restart/redeploy the host publisher;
5. run signed health;
6. confirm old-key requests fail and new-key requests succeed;
7. destroy the superseded secret according to the deployment secret-retention policy.

The current registry does not implement a two-key overlap window. Treat connector-key rotation as a coordinated deployment operation.

`APPLICATION_CONNECTOR_SIGNING_SECRET` is Marketing-internal. Rotating it changes how environment connector keys are hashed; therefore it must be rotated together with a registry reconciliation and tested signed health.

## SSO security

The host may issue SSO only for asserted roles `admin` or `superadmin`.

The SSO issue request itself is HMAC-signed. Marketing creates a short-lived random one-time code (default TTL 120 seconds). The browser receives only the redirect code. Redeeming it:

- locks and consumes the code once;
- rejects expired/already-used codes;
- links the external user identity to a Marketing user;
- provisions owner/admin membership according to the deterministic first-owner rule;
- creates an MFA enrollment session when MFA is not yet configured;
- sets Marketing session credentials as HttpOnly cookies.

`target_path` accepts only an internal path beginning with one `/`; protocol-relative or external redirects are replaced with `/dashboard`.

## Sensitive-data boundary

Conversion `properties` and the complete business-snapshot body pass through recursive server-side field rejection before storage.

Marketing rejects known sensitive/private keys and common suffix/prefix variants including categories such as:

- passwords, secrets, API keys and auth/session tokens;
- card numbers, CVV/CVC, payment tokens and bank-account identifiers;
- direct email, phone/mobile and postal/street address fields;
- health, medical, diagnosis, treatment, medication and veterinary data;
- learner/student progress, teacher feedback, tutor chats and learning records;
- private supplier/wholesale/unit/purchase cost fields.

Rejection code: `CONNECTOR_SENSITIVE_FIELD_REJECTED`.

Excessive recursive nesting also fails closed with `CONNECTOR_PAYLOAD_TOO_DEEP`.

This guard supplements—rather than replaces—host-side data minimization. A host must still construct an allow-listed marketing payload and must not disguise sensitive values under unrelated field names.

SSO email is intentionally outside this generic marketing payload guard because administrator email is necessary for account linkage/authentication.

## Conversion privacy

Where an external user reference is useful for attribution, send a stable opaque host identifier rather than email/phone. Marketing pseudonymizes that subject before writing derived performance events.

Every conversion declares a `consent_basis` from the supported enum. The host is responsible for selecting a basis that is factually and legally appropriate; Marketing does not infer consent.

## Business snapshot privacy

Business snapshots should contain approved public/commercial facts such as product names, approved descriptions, public pricing, plan/features, public offers/promotions and status/availability changes.

Do not include:

- private customer records;
- private staff records;
- private learning/health/veterinary records;
- private supplier commercial terms/costs;
- payment credentials or card data;
- authentication secrets.

Snapshot size is capped at 1 MB and the snapshot `app.id` must match the authenticated connector application ID.

## Failure isolation

Connector publishing is post-commit and best-effort. A Marketing timeout, 4xx/5xx response, network error or outage must not reverse a host order, subscription, entitlement, membership, refund, learner action or other authoritative transaction.

Use a durable outbox/retry worker if guaranteed eventual delivery is required. Preserve the same logical `event_id` on safe retry so Marketing's event-level idempotency can suppress duplicates; the SDK generates a fresh signing nonce for each network attempt.

## Release acceptance security tests

Before production enablement prove all of the following against the frozen build:

- valid signed health succeeds;
- wrong key fails;
- wrong HMAC fails;
- stale timestamp fails;
- replayed nonce fails;
- SSO rejects a non-admin host role;
- SSO code cannot be redeemed twice;
- first owner/subsequent admin behavior is correct;
- MFA is required;
- browser storage contains no access/refresh JWT;
- sensitive connector fields fail closed;
- invalid product/service scope fails closed;
- duplicate conversion event is idempotent;
- Marketing outage does not roll back the host transaction.
