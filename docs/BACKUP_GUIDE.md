# Backup Guide

Amarktai Marketing Platform - Backup and Recovery Procedures

## Backup Strategy

### What to Back Up

| Component | Frequency | Retention | Method |
|-----------|-----------|-----------|--------|
| PostgreSQL Database | Daily | 30 days | pg_dump |
| Redis Data | Daily | 7 days | RDB snapshot |
| Uploaded Files | Daily | 30 days | File copy |
| Configuration | On change | Forever | Git |
| Docker Volumes | Weekly | 4 weeks | Volume backup |

## Database Backup

### Manual Backup

```bash
# Using the backup script
./scripts/backup-database.sh

# Using Docker
docker exec amarktai-postgres pg_dump -U postgres amarktai_marketing | gzip > backup.sql.gz

# Using pg_dump directly
pg_dump -h localhost -U postgres -d amarktai_marketing --format=custom --compress=9 -f backup.dump
```

### Automated Backup (Cron)

```bash
# Add to crontab
0 2 * * * /path/to/scripts/backup-database.sh >> /var/log/amarktai-backup.log 2>&1
```

### Docker Backup

```bash
# Backup PostgreSQL volume
docker run --rm -v amarktai-postgres-data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/postgres_$(date +%Y%m%d).tar.gz /data

# Backup Redis volume
docker run --rm -v amarktai-redis-data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/redis_$(date +%Y%m%d).tar.gz /data
```

## Database Restore

### From pg_dump

```bash
# Restore from custom format
pg_restore -h localhost -U postgres -d amarktai_marketing --clean --if-exists backup.dump

# Restore from SQL
psql -h localhost -U postgres -d amarktai_marketing < backup.sql

# Restore from gzipped SQL
gunzip -c backup.sql.gz | psql -h localhost -U postgres -d amarktai_marketing
```

### From Docker

```bash
# Copy backup into container
docker cp backup.sql amarktai-postgres:/tmp/backup.sql

# Restore
docker exec -i amarktai-postgres psql -U postgres -d amarktai_marketing < backup.sql
```

### Restore Validation

After restore, verify:

```bash
# Check table counts
docker exec amarktai-postgres psql -U postgres -d amarktai_marketing -c "
SELECT schemaname, tablename, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"

# Check migrations
docker exec amarktai-postgres psql -U postgres -d amarktai_marketing -c "
SELECT * FROM migrations ORDER BY id;"

# Verify data integrity
docker exec amarktai-postgres psql -U postgres -d amarktai_marketing -c "
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM campaigns;"
```

## Configuration Backup

### Environment Files

```bash
# Backup environment configuration
cp .env .env.backup.$(date +%Y%m%d)
cp docker/docker-compose.yml docker/docker-compose.yml.backup.$(date +%Y%m%d)
```

### Git Backup

```bash
# Ensure all changes are committed
git add -A
git commit -m "Configuration backup"
git push origin development
```

## Disaster Recovery

### Recovery Time Objectives (RTO)

| Scenario | Target RTO |
|----------|------------|
| Database corruption | 1 hour |
| Complete server failure | 4 hours |
| Data center outage | 8 hours |

### Recovery Point Objectives (RPO)

| Component | Target RPO |
|-----------|------------|
| Database | 24 hours (daily backup) |
| Files | 24 hours |
| Configuration | 0 (Git) |

### Recovery Checklist

1. **Assess the situation**
   - Determine scope of failure
   - Identify affected components
   - Notify stakeholders

2. **Restore infrastructure**
   - Provision new servers if needed
   - Start Docker containers
   - Verify network connectivity

3. **Restore database**
   - Identify latest valid backup
   - Restore database
   - Run migrations if needed
   - Verify data integrity

4. **Restore application**
   - Deploy latest code
   - Configure environment
   - Start services

5. **Verify recovery**
   - Run health checks
   - Test critical paths
   - Monitor for issues

6. **Post-recovery**
   - Document incident
   - Update procedures
   - Schedule post-mortem

## Testing Backups

### Monthly Restore Test

```bash
# Create test database
docker exec amarktai-postgres createdb -U postgres amarktai_test

# Restore backup to test database
pg_restore -h localhost -U postgres -d amarktai_test --clean backup.dump

# Verify
docker exec amarktai-postgres psql -U postgres -d amarktai_test -c "SELECT COUNT(*) FROM users;"

# Cleanup
docker exec amarktai-postgres dropdb -U postgres amarktai_test
```

## Backup Monitoring

### Verify Backups Exist

```bash
# Check latest backup
ls -la backups/ | head -5

# Verify backup size
du -h backups/*.sql.gz | tail -1
```

### Alert on Missing Backups

```bash
# Check if backup exists for today
TODAY=$(date +%Y%m%d)
if ! ls backups/amarktai_marketing_${TODAY}* 1>/dev/null 2>&1; then
  echo "ALERT: No backup found for today!"
  # Send notification
fi
```
