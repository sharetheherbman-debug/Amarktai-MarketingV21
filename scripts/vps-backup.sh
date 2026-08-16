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

backup_dir="${BACKUP_DIR:-/opt/equiprofile-marketing/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
passphrase="${BACKUP_ENCRYPTION_PASSPHRASE:-}"

[[ "${#passphrase}" -ge 24 ]] || fail "BACKUP_ENCRYPTION_PASSPHRASE must be at least 24 characters"
[[ "${passphrase}" != replace-with-* ]] || fail "BACKUP_ENCRYPTION_PASSPHRASE still contains a placeholder"
[[ -f "${ENV_FILE}" ]] || fail "Production environment file is missing"

mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d)"
chmod 700 "${work_dir}"
plain_bundle="${backup_dir}/equiprofile-marketing-${timestamp}.tar.gz"
encrypted_bundle="${plain_bundle}.enc"
trap 'rm -rf "${work_dir}" "${plain_bundle}"' EXIT

log "Creating PostgreSQL backup"
compose exec -T postgres pg_dump \
  --username "${POSTGRES_USER:-amarktai}" \
  --dbname "${POSTGRES_DB:-amarktai_marketing}" \
  --format custom \
  --no-owner \
  --no-acl > "${work_dir}/database.dump"

log "Creating a consistent Redis RDB snapshot"
compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE >/dev/null && test -s /data/dump.rdb'
compose run --rm --no-deps \
  --user 0:0 \
  --entrypoint sh \
  -v "${work_dir}:/backup" \
  redis -c 'cp /data/dump.rdb /backup/redis.dump.rdb && chmod 0644 /backup/redis.dump.rdb'

log "Creating Studio upload backup"
compose run --rm --no-deps \
  --user 0:0 \
  --entrypoint sh \
  -v "${work_dir}:/backup" \
  api -c 'tar -C /app/uploads -czf /backup/uploads.tar.gz . && chmod 0644 /backup/uploads.tar.gz'

log "Capturing production configuration inside the encrypted bundle"
cp "${ENV_FILE}" "${work_dir}/production.env"
chmod 600 "${work_dir}/production.env"

host_nginx_path="${HOST_NGINX_CONFIG_PATH:-}"
if [[ -n "${host_nginx_path}" && -f "${host_nginx_path}" && -r "${host_nginx_path}" ]]; then
  cp "${host_nginx_path}" "${work_dir}/host-nginx.conf"
  chmod 600 "${work_dir}/host-nginx.conf"
elif shared_host_nginx_enabled; then
  log "WARNING: host Nginx config was not captured; set HOST_NGINX_CONFIG_PATH once the canonical vhost exists"
fi

if command -v certbot >/dev/null 2>&1; then
  certbot certificates > "${work_dir}/tls-certificates.txt" 2>&1 || true
fi

{
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'domain=%s\n' "${DOMAIN}"
  printf 'git_commit=%s\n' "$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
  printf 'git_branch=%s\n' "$(git -C "${ROOT_DIR}" symbolic-ref --short -q HEAD 2>/dev/null || echo detached)"
  printf 'reviewed_deploy_sha=%s\n' "${DEPLOY_SHA:-unset}"
  printf 'database=%s\n' "${POSTGRES_DB:-amarktai_marketing}"
  printf 'compose_project=%s\n' "${COMPOSE_PROJECT_NAME:-equiprofile-marketing}"
  printf 'shared_host_nginx=%s\n' "${SHARED_HOST_NGINX:-false}"
  printf 'host_nginx_config=%s\n' "${host_nginx_path:-not-configured}"
} > "${work_dir}/manifest.env"

compose images > "${work_dir}/images.txt"
compose ps --all > "${work_dir}/services.txt"

(
  cd "${work_dir}"
  files=(database.dump redis.dump.rdb uploads.tar.gz production.env manifest.env images.txt services.txt)
  [[ -f host-nginx.conf ]] && files+=(host-nginx.conf)
  [[ -f tls-certificates.txt ]] && files+=(tls-certificates.txt)
  sha256sum "${files[@]}" > SHA256SUMS
)

tar -C "${work_dir}" -czf "${plain_bundle}" .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "${plain_bundle}" \
  -out "${encrypted_bundle}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE
(
  cd "${backup_dir}"
  sha256sum "$(basename "${encrypted_bundle}")" > "$(basename "${encrypted_bundle}").sha256"
)
chmod 600 "${encrypted_bundle}" "${encrypted_bundle}.sha256"
rm -f "${plain_bundle}"

find "${backup_dir}" -type f -name 'equiprofile-marketing-*.tar.gz.enc*' -mtime "+${retention_days}" -delete

log "Encrypted rollback bundle completed: ${encrypted_bundle}"
log "Bundle contains PostgreSQL, Redis, Studio media, production environment, release inventory and available host/TLS metadata"
