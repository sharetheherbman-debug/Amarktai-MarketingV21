# Integration Guide

AmarktAI Marketing Integration & Omnichannel Automation Platform

## Overview

The Integration Framework provides a unified connector system for publishing, syncing, and automating across 21+ marketing platforms. Every connector implements the shared SDK interface with consistent authentication, health monitoring, rate limiting, and audit logging.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Framework                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Providers    │  │  Connections │  │  Sync Logs   │      │
│  │  Registry     │  │  Manager     │  │  & Audit     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Webhooks    │  │  Email       │  │  Import/     │      │
│  │  Engine      │  │  Providers   │  │  Export      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Supported Providers

### CMS Connectors (M6.2)
| Provider | Auth | Capabilities |
|----------|------|--------------|
| WordPress | API Key | publish, draft, update, media, categories, tags, seo |
| Webflow | API Key | publish, draft, update |
| Ghost | API Key | publish, draft, update, tags |

### Social Media Connectors (M6.3)
| Provider | Auth | Capabilities |
|----------|------|--------------|
| Facebook Pages | OAuth2 | publish, schedule, analytics, media |
| Instagram Business | OAuth2 | publish, schedule, analytics, media |
| LinkedIn Pages | OAuth2 | publish, schedule, analytics |
| X (Twitter) | OAuth2 | publish, schedule, analytics |
| YouTube | OAuth2 | upload, schedule, analytics |
| Pinterest | OAuth2 | publish, schedule, analytics |

### Google Ecosystem (M6.4)
| Provider | Auth | Capabilities |
|----------|------|--------------|
| Google Analytics 4 | OAuth2 | traffic, conversions, events |
| Google Search Console | OAuth2 | keywords, impressions, clicks, ctr |
| Google Business Profile | OAuth2 | profile, reviews, posts |
| Google Calendar | OAuth2 | events, reminders |
| Google Drive | OAuth2 | upload, folders |

### Email Providers (M6.5)
| Provider | Auth | Capabilities |
|----------|------|--------------|
| SMTP | Basic | email |
| Gmail | OAuth2 | email |
| Microsoft 365 | OAuth2 | email, calendar |
| Mailgun | API Key | email, tracking, bounces |
| SendGrid | API Key | email, tracking, templates |
| Amazon SES | API Key | email |

### Calendar Providers (M6.6)
| Provider | Auth | Capabilities |
|----------|------|--------------|
| Google Calendar | OAuth2 | events, reminders |
| Outlook Calendar | OAuth2 | events, reminders |

## API Endpoints

### Providers
```
GET  /api/v1/integrations/providers          # List available providers
GET  /api/v1/integrations/providers?category=cms  # Filter by category
```

### Connections
```
GET    /api/v1/integrations/connections           # List connections
GET    /api/v1/integrations/connections/:id       # Get connection
POST   /api/v1/integrations/connections           # Create connection
PUT    /api/v1/integrations/connections/:id       # Update connection
DELETE /api/v1/integrations/connections/:id       # Delete connection
POST   /api/v1/integrations/connections/:id/test  # Test connection
GET    /api/v1/integrations/health                # Health check all
```

### Sync Logs
```
GET  /api/v1/integrations/logs                   # Get sync logs
GET  /api/v1/integrations/logs?connection_id=xxx # Filter by connection
```

### Webhooks
```
GET    /api/v1/integrations/webhooks/incoming     # List incoming webhooks
POST   /api/v1/integrations/webhooks/incoming     # Create incoming webhook
DELETE /api/v1/integrations/webhooks/incoming/:id # Delete incoming webhook

GET    /api/v1/integrations/webhooks/outgoing     # List outgoing webhooks
POST   /api/v1/integrations/webhooks/outgoing     # Create outgoing webhook
DELETE /api/v1/integrations/webhooks/outgoing/:id # Delete outgoing webhook

GET    /api/v1/integrations/webhooks/deliveries   # Get delivery history
```

### Email Providers
```
GET  /api/v1/integrations/email-providers        # List email providers
POST /api/v1/integrations/email-providers        # Create email provider
```

### Import/Export
```
GET  /api/v1/integrations/import-export          # List jobs
POST /api/v1/integrations/import-export          # Create job
GET  /api/v1/integrations/import-export/:id      # Get job status
```

## Database Schema

### Tables
- `integration_providers` - Available integration providers (seeded)
- `integration_connections` - User-configured connections
- `integration_sync_logs` - Audit trail for all sync operations
- `webhooks_incoming` - Incoming webhook configurations
- `webhooks_outgoing` - Outgoing webhook configurations
- `webhook_deliveries` - Webhook delivery history
- `analytics_google` - Google Analytics data cache
- `analytics_search_console` - Google Search Console data cache
- `email_providers` - Email provider configurations
- `import_export_jobs` - Import/export job tracking

### Indexes
All high-volume queries are indexed for performance:
- Organization-scoped queries
- Status-based filtering
- Date-range queries
- Connection lookups

## Frontend Pages

### Integrations Dashboard (`/integrations`)
- Provider browser with category filtering
- Connection management with health status
- Quick actions for testing and configuring

### Webhook Management (`/integrations/webhooks`)
- Incoming webhook configuration
- Outgoing webhook setup
- Delivery history and retry status

### Import/Export (`/integrations/import-export`)
- CSV, Excel, JSON format support
- Entity type selection (contacts, companies, deals, content, campaigns)
- Job progress tracking

## Adding a New Connector

To add a new integration provider:

1. **Add provider to database seed** in `007_integrations.sql`:
```sql
INSERT INTO integration_providers (slug, name, category, description, auth_type, capabilities)
VALUES ('my_provider', 'My Provider', 'cms', 'Description', 'api_key', '["publish","draft"]');
```

2. **Implement connector logic** following the IntegrationProvider interface:
```typescript
interface IntegrationProvider {
  id: string;
  slug: string;
  name: string;
  category: string;
  auth_type: 'oauth2' | 'api_key' | 'basic' | 'none';
  capabilities: string[];
}
```

3. **Use existing service methods** for connection management, health checks, and sync logging.

## Security

- All connections store encrypted auth data
- Webhook secrets for signature validation
- Rate limiting per connection
- Audit logging for all operations
- Permission scoping per connection

## Related Documentation

- [API Documentation](./API.md)
- [Database Schema](./DATABASE.md)
- [Architecture Overview](./ARCHITECTURE.md)

## Application Connector

The **Application Connector** is the generic, server-to-server integration surface for a trusted host product. It is separate from user-configured provider integrations. A host uses a deployment-managed application identifier and connector key, while Marketing stores only a derived key hash and rejects expired, malformed, or replayed signed requests.

| Route | Signed request | Purpose | Idempotency behavior |
| --- | --- | --- | --- |
| `POST /api/v1/application-connectors/sso/issue` | Yes | Issues a short-lived Marketing SSO redirect for a trusted host administrator. | Each code is single-use and time-limited. |
| `POST /api/v1/application-connectors/sso/redeem` | No; one-time code | Redeems an SSO code in the user’s browser. | Reused or expired codes are rejected. |
| `POST /api/v1/application-connectors/events/conversion` | Yes | Records a consent-bounded conversion event. | `event_id` is unique per application; duplicate delivery returns `200`. |
| `POST /api/v1/application-connectors/business-snapshot` | Yes | Records a versioned, authoritative business snapshot. | A matching canonical payload returns the current version without creating a duplicate. |

All signed calls use `X-Application-Id`, `X-Application-Key`, `X-Application-Timestamp`, `X-Application-Nonce`, and `X-Application-Signature`. The signature is HMAC-SHA-256 over the Unix timestamp, nonce, and recursively key-sorted JSON body, each separated by a newline. Marketing accepts only requests within the configured clock-skew window and records nonces to prevent replay.

The workspace package [`@amarktai/application-connector-sdk`](../packages/application-connector-sdk/README.md) implements this exact wire protocol for server-side hosts. It does not contain deployment credentials or customer-specific configuration. Hosts must send it only after their own durable transaction commits; delivery failures must be contained and cannot reverse payment, entitlement, membership, or fulfilment decisions.

### Product-line context and attribution

A host may send an optional `product_line` in conversion properties and business-snapshot records. Marketing persists that context through conversion storage, performance attribution, campaign plans, campaign assets, and Growth Director learning. The supplied value must be one of the product scopes enabled by the Marketing deployment; unclassified historic records remain valid but are never silently reclassified. Conversion events require an explicit `consent_basis` and should use pseudonymous or aggregate data wherever practical.

### Deployment configuration

Connector values are supplied only during controlled deployment. The host needs a Marketing base URL, application identifier, and connector key. Marketing needs its signing secret plus the corresponding host connector configuration. Never place a connector key in browser code, a repository, a log, or a user-visible response.

## References

[1] [Application Connector SDK](../packages/application-connector-sdk/README.md)

[2] [Application Connector server routes](../apps/api/src/routes/application-connectors.ts)

[3] [Application Connector authentication and persistence service](../apps/api/src/services/application-connector.service.ts)
