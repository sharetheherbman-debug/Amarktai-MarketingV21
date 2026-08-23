#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command docker
require_command openssl
require_command tar
require_command sha256sum
require_command curl
load_production_env

backup_file="${1:-}"
confirmation="${2:-}"
[[ -n "${backup_file}" && -f "${backup_file}" ]] || fail "Usage: bash scripts/vps-restore.sh /path/to/marketing-backup.tar.gz.enc --yes"
[[ "${confirmation}" == "--yes" ]] || fail "Restore replaces the Marketing database, Redis state and Studio uploads. Re-run with --yes."
[[ "${#BACKUP_ENCRYPTION_PASSPHRASE:-}" -ge 24 ]] || fail "BACKUP_ENCRYPTION_PASSPHRASE is missing or too short"

if [[ -f "${backup_file}.sha256" ]]; then
  (cd "$(dirname "${backup_file}")" && sha256sum -c "$(basename "${backup_file}.sha256")")
fi

work_dir="$(mktemp -d)"
chmod 700 "${work_dir}"
plain_bundle="${work_dir}/backup.tar.gz"
trap 'rm -rf "${work_dir}"' EXIT

log "Decrypting rollback bundle"
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

for required in database.dump redis.dump.rdb uploads.tar.gz manifest.env; do
  [[ -f "${work_dir}/${required}" ]] || fail "Backup does not contain ${required}"
done

log "Stopping Marketing application and workers"
compose stop caddy nginx web api generation-worker longform-still-worker render-worker redis || true
compose up -d postgres

log "Waiting for PostgreSQL"
postgres_ready=0
for _attempt in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U "${POSTGRES_USER:-marketing}" -d postgres >/dev/null 2>&1; then
    postgres_ready=1
    break
  fi
  sleep 2
done
[[ "${postgres_ready}" == "1" ]] || fail "PostgreSQL did not become ready for restore"

log "Replacing Marketing PostgreSQL database"
compose exec -T postgres dropdb \
  --username "${POSTGRES_USER:-marketing}" \
  --if-exists --force "${POSTGRES_DB:-marketing}"
compose exec -T postgres createdb \
  --username "${POSTGRES_USER:-marketing}" \
  --owner "${POSTGRES_USER:-marketing}" \
  "${POSTGRES_DB:-marketing}"
compose exec -T postgres pg_restore \
  --username "${POSTGRES_USER:-marketing}" \
  --dbname "${POSTGRES_DB:-marketing}" \
  --no-owner --no-acl < "${work_dir}/database.dump"

log "Replacing Studio uploads"
compose run --rm --no-deps \
  --user 0:0 \
  --entrypoint sh \
  -v "${work_dir}:/backup:ro" \
  api -c 'find /app/uploads -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /app/uploads -xzf /backup/uploads.tar.gz && chown -R 1001:1001 /app/uploads'

log "Replacing Redis persistent state from consistent RDB snapshot"
compose stop redis || true
compose run --rm --no-deps \
  --user 0:0 \
  --entrypoint sh \
  -v "${work_dir}:/backup:ro" \
  redis -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp /backup/redis.dump.rdb /data/dump.rdb && chmod 0644 /data/dump.rdb'
compose up -d redis

if [[ "${RESTORE_PRODUCTION_ENV:-0}" == "1" && -f "${work_dir}/production.env" ]]; then
  log "Restoring production environment because RESTORE_PRODUCTION_ENV=1"
  cp "${work_dir}/production.env" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

if [[ "${RESTORE_HOST_NGINX:-0}" == "1" && -f "${work_dir}/host-nginx.conf" && -n "${HOST_NGINX_CONFIG_PATH:-}" ]]; then
  log "Restoring captured host Nginx vhost because RESTORE_HOST_NGINX=1"
  cp "${work_dir}/host-nginx.conf" "${HOST_NGINX_CONFIG_PATH}"
fi

log "Applying current additive migrations and starting core services only"
compose run --rm migrate
if shared_host_nginx_enabled; then
  compose up -d api web nginx
else
  compose up -d api web nginx caddy
fi

ready=0
readiness_url="http://127.0.0.1:${HTTP_PORT:-8080}/ready"
if ! shared_host_nginx_enabled; then readiness_url="https://${DOMAIN}/ready"; fi
for _attempt in $(seq 1 72); do
  if curl --fail --silent --show-error --max-time 10 "${readiness_url}" | grep -q '"status":"ready"'; then
    ready=1
    break
  fi
  sleep 5
done
[[ "${ready}" == "1" ]] || fail "Restored core application did not become ready"

bash "${SCRIPT_DIR}/vps-smoke.sh" core

if [[ "${RESTORE_WORKERS:-0}" == "1" ]]; then
  log "RESTORE_WORKERS=1: restoring worker execution after core acceptance"
  compose up -d generation-worker longform-still-worker render-worker
  bash "${SCRIPT_DIR}/vps-smoke.sh" full
else
  log "Workers remain held after restore; enable only after direct provider acceptance"
fi

log "Restore completed successfully from ${backup_file}"
