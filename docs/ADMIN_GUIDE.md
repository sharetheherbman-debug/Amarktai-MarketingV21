# AmarktAI Marketing — Administrator Guide

## Overview

This guide covers the administration of AmarktAI Marketing after initial deployment. It is intended for system administrators and organization owners.

## First-Time Setup

### Onboarding Wizard

On first deployment, the application launches an onboarding wizard that guides you through:

1. **Create Admin Account** — Set up the first administrator
2. **Application Configuration** — Set the application URL (defaults to `marketing.amarktai.co.za`)
3. **AI Provider Setup** — Configure GenX Router, Together AI, and DeepInfra API keys
4. **Default Models** — Select default chat, embedding, and image models
5. **Create Organization** — Set up your first organization/workspace
6. **Complete** — Wizard finishes and redirects to the dashboard

### Post-Setup Verification

After completing the wizard:

1. Verify all AI providers show "Connected" status in **Admin → Providers**
2. Test each provider using the "Test Connection" button
3. Verify the dashboard loads without errors
4. Check that notifications are working

## Managing AI Providers

### Adding a Provider

1. Navigate to **Admin → Providers**
2. Click **Add Provider**
3. Select provider type (GenX Router, Together AI, DeepInfra)
4. Enter the API key (encrypted at rest using AES-256-GCM)
5. Set the base URL (pre-filled for known providers)
6. Configure models (comma-separated list)
7. Set priority (higher = preferred)
8. Click **Test Connection** to verify
9. Click **Save**

### Provider Priority

Providers are tried in priority order (highest first). If a provider fails, the system automatically falls back to the next available provider.

- **Priority 3** — Primary provider (tried first)
- **Priority 2** — Secondary provider
- **Priority 1** — Tertiary provider (tried last)

### Health Monitoring

The system automatically checks provider health every 5 minutes. Health status is displayed in the admin panel:

- **Healthy** — Provider is responding normally
- **Degraded** — Provider is responding but with errors
- **Unhealthy** — Provider is not responding
- **Unknown** — Health check has not run yet

### API Key Security

- API keys are encrypted using AES-256-GCM before storage
- Keys are never logged or exposed in API responses
- Keys are only decrypted when making provider API calls
- The encryption key is stored in the `ENCRYPTION_KEY` environment variable

## Managing Users

### Inviting Users

1. Navigate to **Admin → Users**
2. Click **Invite User**
3. Enter the user's email address
4. Select a role (Member, Admin, Owner)
5. Click **Send Invitation**

The invited user receives an email with a link to accept the invitation and create their account.

### User Roles

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, can delete organization, manage billing |
| **Admin** | Manage users, providers, settings; cannot delete org |
| **Member** | Standard access to projects, campaigns, content |

### Disabling Users

1. Navigate to **Admin → Users**
2. Find the user
3. Click the status toggle to disable/enable
4. Disabled users cannot log in but their data is preserved

## Managing Organizations

### Organization Settings

Navigate to **Settings → Organization** to configure:

- **Name** — Display name
- **Slug** — URL-friendly identifier
- **Logo** — Organization logo upload

### Workspace Isolation

Each organization has completely isolated data:
- Projects, campaigns, content, agents
- AI provider configurations
- Memory and knowledge base
- Usage tracking and analytics
- Team members and roles

## Database Management

### Migrations

Database migrations are located in `apps/api/src/db/migrations/`. To run migrations:

```bash
# Using Docker
docker exec -i amarktai-postgres psql -U amarktai -d amarktai_marketing < apps/api/src/db/migrations/001_initial.sql

# Manual
psql -U amarktai -d amarktai_marketing -f apps/api/src/db/migrations/001_initial.sql
```

### Backups

#### Automated Backups

Set up a cron job for automated PostgreSQL backups:

```bash
# Add to crontab
0 2 * * * docker exec amarktai-postgres pg_dump -U amarktai amarktai_marketing > /backups/amarktai_$(date +\%Y\%m\%d).sql
```

#### Manual Backup

```bash
docker exec amarktai-postgres pg_dump -U amarktai amarktai_marketing > backup.sql
```

#### Restore

```bash
docker exec -i amarktai-postgres psql -U amarktai -d amarktai_marketing < backup.sql
```

### Monitoring

Check database size:
```sql
SELECT pg_size_pretty(pg_database_size('amarktai_marketing'));
```

Check active connections:
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'amarktai_marketing';
```

Check table sizes:
```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

## Redis Management

### Checking Redis Health

```bash
docker exec amarktai-redis redis-cli -a <password> ping
```

### Clearing Cache

```bash
# Clear all cache
docker exec amarktai-redis redis-cli -a <password> FLUSHDB

# Clear specific pattern
docker exec amarktai-redis redis-cli -a <password> KEYS "config:*"
```

## Scheduled Tasks

The application runs the following scheduled tasks automatically:

| Task | Interval | Description |
|------|----------|-------------|
| Health Check | 5 minutes | Checks all enabled AI providers |
| Token Cleanup | 1 hour | Removes expired refresh tokens |
| Invitation Cleanup | 1 hour | Removes expired invitations |

## Usage Tracking

### Viewing Usage

Navigate to **Admin → Providers → Usage** to view:

- Total API calls this month
- Cost breakdown by provider
- Token usage by model
- Usage trends over time

### Cost Estimation

The system estimates costs based on provider pricing:

| Provider | Model | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|-------|----------------------|------------------------|
| GenX Router | gpt-4o | $2.50 | $10.00 |
| GenX Router | gpt-4o-mini | $0.15 | $0.60 |
| Together AI | llama-3.1-70b | $0.88 | $0.88 |
| DeepInfra | mixtral-8x7b | $0.24 | $0.24 |

## Troubleshooting

### Application Won't Start

1. Check Docker logs: `docker compose logs api`
2. Verify database is running: `docker compose ps postgres`
3. Verify Redis is running: `docker compose ps redis`
4. Check environment variables in `.env`

### Database Connection Errors

1. Verify `DATABASE_URL` is correct
2. Check PostgreSQL is running and healthy
3. Verify the database exists
4. Check firewall rules if using external database

### AI Provider Errors

1. Verify API key is correct (test connection in admin panel)
2. Check provider health status
3. Review API logs for specific error messages
4. Verify the provider's base URL is accessible

### Email Not Sending

1. Verify SMTP credentials in `.env`
2. Check SMTP host and port
3. Test with a manual SMTP connection
4. Check spam folders

## Security Best Practices

1. **Change default passwords** — Update all default credentials
2. **Use HTTPS** — Configure SSL/TLS in Nginx
3. **Rotate secrets** — Regularly rotate JWT and encryption keys
4. **Monitor logs** — Review application logs regularly
5. **Update dependencies** — Keep packages up to date
6. **Backup regularly** — Automate database backups
7. **Limit access** — Use RBAC to restrict admin access
8. **Review audit logs** — Check audit_logs table for suspicious activity

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | No | API port (default: 4000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Secret for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | Secret for refresh tokens (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | AES-256 key for encrypting API keys |
| `APP_URL` | Yes | Frontend URL (e.g., `https://marketing.amarktai.co.za`) |
| `API_URL` | Yes | Backend URL (e.g., `https://marketing.amarktai.co.za/api`) |
| `SMTP_HOST` | No | SMTP server for emails |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | Sender email address |
