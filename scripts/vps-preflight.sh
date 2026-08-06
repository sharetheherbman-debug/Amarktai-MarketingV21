#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command docker
require_command curl
require_command openssl
require_command git
require_command awk
require_command grep

load_production_env

required_variables=(
  DOMAIN TLS_EMAIL APP_URL API_URL CORS_ORIGIN
  POSTGRES_PASSWORD REDIS_PASSWORD JWT_SECRET JWT_REFRESH_SECRET
  ENCRYPTION_KEY GENX_API_KEY GENX_BASE_URL DEFAULT_TEXT_MODEL GENX_WEBHOOK_SECRET GENX_WEBHOOK_URL
)

for key in "${required_variables[@]}"; do
  value="${!key:-}"
  [[ -n "${value}" ]] || fail "${key} is required in ${ENV_FILE}"
  if [[ "${value}" == replace-with-* || "${value}" == change-me-* ]]; then
    fail "${key} still contains a placeholder"
  fi
done

[[ "${#POSTGRES_PASSWORD}" -ge 24 ]] || fail "POSTGRES_PASSWORD must be at least 24 characters"
[[ "${#REDIS_PASSWORD}" -ge 24 ]] || fail "REDIS_PASSWORD must be at least 24 characters"
[[ "${#JWT_SECRET}" -ge 32 ]] || fail "JWT_SECRET must be at least 32 characters"
[[ "${#JWT_REFRESH_SECRET}" -ge 32 ]] || fail "JWT_REFRESH_SECRET must be at least 32 characters"
[[ "${#GENX_WEBHOOK_SECRET}" -ge 32 ]] || fail "GENX_WEBHOOK_SECRET must be at least 32 characters"
[[ "${ENCRYPTION_KEY}" =~ ^[a-fA-F0-9]{64}$ ]] || fail "ENCRYPTION_KEY must be exactly 64 hexadecimal characters"
[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]] || fail "DOMAIN is not a valid hostname"
[[ "${APP_URL}" == "https://${DOMAIN}" ]] || fail "APP_URL must be https://${DOMAIN}"
[[ "${API_URL}" == "https://${DOMAIN}/api" ]] || fail "API_URL must be https://${DOMAIN}/api"
[[ ",${CORS_ORIGIN}," == *",https://${DOMAIN},"* ]] || fail "CORS_ORIGIN must include https://${DOMAIN}"
[[ "${GENX_WEBHOOK_URL}" == "https://${DOMAIN}/api/v1/webhooks/genx" ]] || fail "GENX_WEBHOOK_URL must use the public signed webhook route"

if [[ "${GENX_API_KEY}" != gnxk_* ]]; then
  log "WARNING: GENX_API_KEY does not use the current gnxk_ prefix; the live API checks below will determine whether it is valid."
fi

if [[ -n "${STRIPE_SECRET_KEY:-}" || -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  [[ "${STRIPE_SECRET_KEY:-}" == sk_* ]] || fail "STRIPE_SECRET_KEY must be a Stripe secret key when paid Marketplace checkout is enabled"
  [[ "${STRIPE_WEBHOOK_SECRET:-}" == whsec_* ]] || fail "STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret when paid Marketplace checkout is enabled"
fi

chmod 600 "${ENV_FILE}"

docker info >/dev/null 2>&1 || fail "Docker daemon is not available"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available"

cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)"
memory_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
memory_gb="$((memory_kb / 1024 / 1024))"
disk_gb="$(df -Pk "${ROOT_DIR}" | awk 'NR==2 {print int($4/1024/1024)}')"

if [[ "${ALLOW_LOW_RESOURCES:-0}" != "1" ]]; then
  [[ "${cpu_count}" -ge 4 ]] || fail "At least 4 CPU cores are required; found ${cpu_count}. Set ALLOW_LOW_RESOURCES=1 only for non-production testing."
  [[ "${memory_gb}" -ge 7 ]] || fail "At least 8 GB RAM is required; found approximately ${memory_gb} GB."
  [[ "${disk_gb}" -ge 20 ]] || fail "At least 20 GB free disk is required; found ${disk_gb} GB."
fi

compose config --quiet

genx_base="${GENX_BASE_URL%/}"
genx_curl=(curl --fail --silent --show-error --location --retry 2 --retry-delay 2 --connect-timeout 10 --max-time 45 -H "Authorization: Bearer ${GENX_API_KEY}")

log "Verifying GenX text model access"
text_catalogue="$(${genx_curl[@]} "${genx_base}/v1/models")" || fail "GenX text catalogue request failed; verify GENX_API_KEY and GENX_BASE_URL"
[[ -n "${text_catalogue}" ]] || fail "GenX text catalogue returned an empty response"
grep -Fq "${DEFAULT_TEXT_MODEL}" <<<"${text_catalogue}" || fail "DEFAULT_TEXT_MODEL ${DEFAULT_TEXT_MODEL} is not present in the GenX text catalogue"

log "Verifying GenX image catalogue access"
image_catalogue="$(${genx_curl[@]} "${genx_base}/api/v1/models?category=image")" || fail "GenX image catalogue request failed"
grep -Eq '"(id|model_id|models|data)"' <<<"${image_catalogue}" || fail "GenX image catalogue returned no recognizable model data"

log "Verifying GenX video catalogue access"
video_catalogue="$(${genx_curl[@]} "${genx_base}/api/v1/models?category=video")" || fail "GenX video catalogue request failed"
grep -Eq '"(id|model_id|models|data)"' <<<"${video_catalogue}" || fail "GenX video catalogue returned no recognizable model data"

if ! ${genx_curl[@]} "${genx_base}/api/v1/account/credits" >/dev/null; then
  log "WARNING: GenX credit-balance endpoint was unavailable. Catalogue access passed, but confirm sufficient account credit before acceptance generation."
else
  log "GenX account access passed"
fi

if command -v getent >/dev/null 2>&1; then
  if ! getent ahostsv4 "${DOMAIN}" >/dev/null 2>&1; then
    log "WARNING: DNS for ${DOMAIN} does not currently resolve from this VPS. TLS issuance will wait until DNS is correct."
  fi
fi

mkdir -p "${BACKUP_DIR:-/opt/amarktai/backups}"

log "Preflight passed"
log "Domain: ${DOMAIN}"
log "GenX text model: ${DEFAULT_TEXT_MODEL}"
log "CPU cores: ${cpu_count}; RAM: ~${memory_gb} GB; free disk: ${disk_gb} GB"
log "Compose configuration and GenX catalogue access are valid"
