#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command docker
require_command openssl
require_command tar
require_command sha256sum
load_production_env

backup_file="${1:-}"
confirmation="${2:-}"
[[ -n "${backup_file}" && -f "${backup_file}" ]] || fail "Usage: bash scripts/vps-restore.sh /path/to/amarktai-backup.tar.gz.enc --yes"
[[ "${confirmation}" == "--yes" ]] || fail "Restore replaces the production database and uploads. Re-run with --yes."
[[ "${#BACKUP_ENCRYPTION_PASSPHRASE:-}" -ge 24 ]] || fail "BACKUP_ENCRYPTION_PASSPHRASE is missing or too short"

if [[ -f "${backup_file}.sha256" ]]; then
  (cd "$(dirname "${backup_file}")" && sha256sum -c "$(basename "${backup_file}.sha256")")
fi

work_dir="$(mktemp -d)"
plain_bundle="${work_dir}/backup.tar.gz"
trap 'rm -rf "${work_dir}"' EXIT

log "Decrypting backup"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "${backup_file}" \
  -out "${plain_bundle}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

tar -C "${work_dir}" -xzf "${plain_bundle}"
rm -f "${plain_bundle}"
(
  cd "${work_dir}"
  sha256sum -c SHA256SUMS
)

[[ -f "${work_dir}/database.dump" ]] || fail "Backup does not contain database.dump"
[[ -f "${work_dir}/uploads.tar.gz" ]] || fail "Backup does not contain uploads.tar.gz"

log "Stopping application services"
compose stop caddy nginx web api generation-worker render-worker || true
compose up -d postgres redis

log "Waiting for PostgreSQL"
for _attempt in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U "${POSTGRES_USER:-amarktai}" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

log "Replacing production database"
compose exec -T postgres dropdb \
  --username "${POSTGRES_USER:-amarktai}" \
  --if-exists --force "${POSTGRES_DB:-amarktai_marketing}"
compose exec -T postgres createdb \
  --username "${POSTGRES_USER:-amarktai}" \
  --owner "${POSTGRES_USER:-amarktai}" \
  "${POSTGRES_DB:-amarktai_marketing}"
cat "${work_dir}/database.dump" | compose exec -T postgres pg_restore \
  --username "${POSTGRES_USER:-amarktai}" \
  --dbname "${POSTGRES_DB:-amarktai_marketing}" \
  --no-owner --no-acl

log "Replacing Studio uploads"
compose run --rm --no-deps \
  --entrypoint sh \
  -v "${work_dir}:/backup" \
  api -c 'find /app/uploads -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /app/uploads -xzf /backup/uploads.tar.gz'

log "Applying current migrations and restarting services"
compose run --rm migrate
compose up -d api generation-worker render-worker web nginx caddy

ready=0
for _attempt in $(seq 1 72); do
  if curl --fail --silent --show-error --max-time 10 "https://${DOMAIN}/ready" | grep -q '"status":"ready"'; then
    ready=1
    break
  fi
  sleep 5
done
[[ "${ready}" == "1" ]] || fail "Restored application did not become ready"

bash "${SCRIPT_DIR}/vps-smoke.sh"
log "Restore completed successfully from ${backup_file}"
