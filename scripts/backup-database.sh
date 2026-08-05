#!/bin/bash
# AmarktAI Marketing - Database Backup Script
# Usage: ./scripts/backup-database.sh

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/amarktai_marketing_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Database connection
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-amarktai_marketing}"
DB_USER="${POSTGRES_USER:-postgres}"

echo "Starting backup of ${DB_NAME}..."

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Perform backup
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --verbose \
  -f "${BACKUP_FILE}"

# Verify backup
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
  echo "Backup successful: ${BACKUP_FILE}"
  echo "Size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
  echo "ERROR: Backup failed!"
  exit 1
fi

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup complete."
