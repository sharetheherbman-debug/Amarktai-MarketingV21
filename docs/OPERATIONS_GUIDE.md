# Operations Guide

AmarktAI Marketing Platform - Operations and Monitoring

## System Health Monitoring

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic health check |
| `GET /api/v1/health` | Detailed health with uptime |
| `GET /api/v1/health/version` | Version information |
| `GET /api/v1/admin/health` | System health with service status |
| `GET /api/v1/admin/metrics` | Platform metrics |
| `GET /api/v1/admin/providers/status` | AI provider status |
| `GET /api/v1/admin/queues` | Queue status |

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2026-08-05T10:00:00.000Z",
  "services": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 1 },
    "queue": { "status": "healthy", "latency_ms": 0 },
    "storage": { "status": "healthy", "latency_ms": 0 }
  },
  "metrics": {
    "total_organizations": 100,
    "total_users": 500,
    "active_subscriptions": 80,
    "total_content": 5000,
    "total_campaigns": 200
  }
}
```

## Monitoring Stack

### Recommended Tools

- **Metrics**: Prometheus + Grafana
- **Logging**: ELK Stack or Loki
- **Alerting**: PagerDuty or OpsGenie
- **Uptime**: Better Uptime or UptimeRobot

### Key Metrics to Monitor

| Metric | Alert Threshold |
|--------|-----------------|
| API Response Time | > 2 seconds |
| Error Rate | > 1% |
| Database Connections | > 80% pool |
| Redis Memory | > 80% |
| Disk Usage | > 80% |
| CPU Usage | > 80% |
| Queue Depth | > 1000 jobs |

## Alerting

### Alert Levels

| Level | Description | Response |
|-------|-------------|----------|
| Critical | Service down | Immediate response |
| Warning | Degraded performance | Response within 1 hour |
| Info | Informational | Review daily |

### Alert Channels

- Critical: PagerDuty + Slack
- Warning: Slack
- Info: Email digest

## Incident Response

### Severity Levels

1. **SEV1**: Complete outage - All hands
2. **SEV2**: Major feature broken - On-call + team lead
3. **SEV3**: Minor feature broken - On-call
4. **SEV4**: Cosmetic issue - Next business day

### Incident Workflow

1. Detect (monitoring alert)
2. Triage (assess severity)
3. Communicate (status page)
4. Mitigate (temporary fix)
5. Resolve (permanent fix)
6. Review (post-mortem)

## Maintenance

### Scheduled Maintenance

- Database vacuum: Weekly
- Log rotation: Daily
- Certificate renewal: Auto (Let's Encrypt)
- Dependency updates: Monthly

### Maintenance Mode

```bash
# Enable maintenance mode
docker compose -f docker/docker-compose.yml stop web

# Perform maintenance
# ...

# Disable maintenance mode
docker compose -f docker/docker-compose.yml start web
```

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.scale.yml
services:
  api:
    deploy:
      replicas: 3
```

### Database Scaling

- Read replicas for analytics
- Connection pooling (pgBouncer)
- Query optimization

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Database connection refused | Check PostgreSQL container status |
| Redis connection failed | Verify Redis password |
| API timeout | Check provider health |
| Build failure | Run `npm run verify` |
| Migration failure | Check migration order |

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=development LOG_LEVEL=debug npm run dev

# Check database connection
docker exec amarktai-postgres pg_isready

# Check Redis connection
docker exec amarktai-redis redis-cli ping
```
