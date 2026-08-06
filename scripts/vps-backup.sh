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

backup_dir="${BACKUP_DIR:-/opt/amarktai/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
passphrase="${BACKUP_ENCRYPTION_PASSPHRASE:-}"

[[ "${#passphrase}" -ge 24 ]] || fail "BACKUP_ENCRYPTION_PASSPHRASE must be at least 24 characters"
[[ "${passphrase}" != replace-with-* ]] || fail "BACKUP_ENCRYPTION_PASSPHRASE still contains a placeholder"

mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d)"
plain_bundle="${backup_dir}/amarktai-${timestamp}.tar.gz"
encrypted_bundle="${plain_bundle}.enc"
trap 'rm -rf "${work_dir}" "${plain_bundle}"' EXIT

log "Creating PostgreSQL backup"
compose exec -T postgres pg_dump \
  --username "${POSTGRES_USER:-amarktai}" \
  --dbname "${POSTGRES_DB:-amarktai_marketing}" \
  --format custom \
  --no-owner \
  --no-acl > "${work_dir}/database.dump"

log "Creating Studio upload backup"
compose run --rm --no-deps \
  --entrypoint sh \
  -v "${work_dir}:/backup" \
  api -c 'tar -C /app/uploads -czf /backup/uploads.tar.gz .'

{
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'domain=%s\n' "${DOMAIN}"
  printf 'git_commit=%s\n' "$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
  printf 'database=%s\n' "${POSTGRES_DB:-amarktai_marketing}"
  printf 'compose_project=%s\n' "${COMPOSE_PROJECT_NAME:-amarktai-marketing}"
} > "${work_dir}/manifest.env"

compose images > "${work_dir}/images.txt"
(
  cd "${work_dir}"
  sha256sum database.dump uploads.tar.gz manifest.env images.txt > SHA256SUMS
)

tar -C "${work_dir}" -czf "${plain_bundle}" .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "${plain_bundle}" \
  -out "${encrypted_bundle}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE
sha256sum "${encrypted_bundle}" > "${encrypted_bundle}.sha256"
chmod 600 "${encrypted_bundle}" "${encrypted_bundle}.sha256"
rm -f "${plain_bundle}"

find "${backup_dir}" -type f -name 'amarktai-*.tar.gz.enc*' -mtime "+${retention_days}" -delete

log "Encrypted backup completed: ${encrypted_bundle}"
