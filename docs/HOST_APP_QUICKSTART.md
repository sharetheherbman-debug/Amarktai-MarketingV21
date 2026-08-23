# Host Application Quickstart

## Goal

Connect one trusted server-side host application to a standalone Marketing deployment without sharing databases, sessions, or product-specific code.

## 1. Build the connector SDK

From the Marketing repository:

```bash
npm ci
npm run build --workspace=@amarktai/application-connector-sdk
```

The host may consume the package from the controlled release artifact/workspace used by your deployment process.

## 2. Generate secrets

Generate high-entropy secrets through your deployment secret manager. Do not paste real values into source control or documentation.

Required Marketing-side values:

```dotenv
HOST_APP_ID=client-portal
HOST_APP_NAME=Client Portal
HOST_APP_URL=https://app.client.example
HOST_APP_CONNECTOR_KEY=<same high-entropy connector key as host>
APPLICATION_CONNECTOR_SIGNING_SECRET=<independent high-entropy Marketing secret>
```

Required host-side values:

```dotenv
MARKETING_BASE_URL=https://marketing.client.example
HOST_APP_ID=client-portal
HOST_APP_CONNECTOR_KEY=<matching connector key>
```

`HOST_APP_ID` must be a stable lowercase slug. Production URLs must use HTTPS. Connector/signing secrets must be at least 32 characters.

For the EquiProfile first-host deployment only, existing `EQUIPROFILE_*` connector environment names remain supported aliases. New deployments should use `HOST_APP_*`.

## 3. Configure white-label Marketing branding

The web application has neutral defaults and may be branded per deployment:

```dotenv
NEXT_PUBLIC_MARKETING_BRAND_NAME=Client Marketing
NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION=Marketing operations for Client
NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL=support@client.example
```

These are public presentation values only. Never place secrets in `NEXT_PUBLIC_*` variables.

## 4. Create the host server client

```ts
import { ApplicationConnectorClient } from '@amarktai/application-connector-sdk';

export const marketing = new ApplicationConnectorClient({
  baseUrl: process.env.MARKETING_BASE_URL!,
  applicationId: process.env.HOST_APP_ID!,
  connectorKey: process.env.HOST_APP_CONNECTOR_KEY!,
});
```

Instantiate this only in trusted server code.

## 5. Test the signed connection

```ts
const health = await marketing.testConnection();
console.log(health.data.connected, health.data.application_id);
```

Expected result: signed health succeeds and the returned application ID matches the configured host ID.

Do not continue if health fails.

## 6. Open Marketing through SSO

After authenticating an authorized host `admin` or `superadmin` on the host server:

```ts
const handoff = await marketing.issueSso({
  external_user_id: currentAdmin.id,
  email: currentAdmin.email,
  display_name: currentAdmin.name,
  external_role: currentAdmin.isSuperAdmin ? 'superadmin' : 'admin',
  target_path: '/dashboard',
});

return redirect(handoff.data.redirect_url);
```

The Marketing browser redeems the one-time code, sets HttpOnly session cookies and requires MFA enrollment before dashboard access when MFA is not already configured.

The first authorized host administrator for a new workspace becomes Marketing owner; subsequent authorized host administrators become Marketing admins.

## 7. Send initial approved business knowledge

After the Marketing workspace exists:

```ts
await marketing.publishBusinessSnapshot({
  snapshot_id: `catalogue-${Date.now()}`,
  occurred_at: new Date().toISOString(),
  app: {
    id: process.env.HOST_APP_ID!,
    name: 'Client Portal',
    domain: 'app.client.example',
    product_lines: ['crm-pro', 'consulting'],
  },
  products: [
    {
      name: 'CRM Pro',
      product_line: 'crm-pro',
      public_price_pence: 4900,
      status: 'available',
    },
  ],
  authoritative_fields: ['products', 'pricing', 'status_changes'],
});
```

Only publish approved marketing-safe facts. Do not send email/phone/address data, passwords/tokens, card/bank fields, learner/teacher/private health records, or private supplier cost information.

## 8. Publish a conversion after host commit

```ts
const eventId = hostOrder.marketingEventId; // stable ID persisted by the host

await marketing.publishConversion({
  event_id: eventId,
  event_type: 'order_paid',
  occurred_at: hostOrder.paidAt.toISOString(),
  external_organization_id: hostOrder.accountId,
  value_pence: hostOrder.totalPence,
  currency: 'GBP',
  consent_basis: 'contract',
  properties: {
    product_lines: ['crm-pro'],
    source: 'checkout',
  },
});
```

Call this only after the host order/payment transaction is authoritative. A Marketing failure must not reverse that transaction.

For durable delivery, publish through a host outbox/worker and retain the same `event_id` across retries.

## 9. Prove idempotency and security before enablement

Do not enable normal event publishing until the integration acceptance run proves:

- valid signed health succeeds;
- wrong key/signature fails;
- stale timestamp fails;
- replayed nonce fails;
- non-admin SSO is rejected;
- one-time SSO code cannot be reused;
- MFA is enforced;
- browser JWTs are not stored in JavaScript storage;
- one conversion is `201` and duplicate `event_id` is `200`/duplicate;
- invalid scope fails;
- prohibited sensitive fields fail;
- identical business snapshot is detected as duplicate;
- changed snapshot increments version;
- host transaction remains successful when Marketing is unavailable.

## 10. Operational checks

After production deploy:

- signed health;
- Marketing API/web health endpoints;
- PostgreSQL/Redis health;
- connector `last_seen_at` advancing;
- no connector credentials in logs;
- no unexpected sensitive-field rejections;
- delivery retry/outbox backlog within normal limits;
- SSO + MFA journey from the host;
- one controlled test conversion and snapshot.

For the full protocol and security rules read `HOST_APP_INTEGRATION.md`, `HOST_APP_SECURITY.md`, and `HOST_APP_EVENT_CONTRACT.md`.
