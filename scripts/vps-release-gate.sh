#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command git
load_production_env

cd "${ROOT_DIR}"

reviewed_sha="${DEPLOY_SHA:-}"
[[ "${reviewed_sha}" =~ ^[0-9a-f]{40}$ ]] || fail "DEPLOY_SHA must be the exact 40-character Git commit reviewed for this release"
current_sha="$(git rev-parse HEAD)"
[[ "${current_sha}" == "${reviewed_sha}" ]] || fail "Refusing deployment: HEAD ${current_sha} does not equal reviewed DEPLOY_SHA ${reviewed_sha}"

git diff --quiet && git diff --cached --quiet || fail "Repository has uncommitted changes; refusing deployment"

is_placeholder_value() {
  local value="${1:-}"
  [[ -z "${value}" \
    || "${value}" == replace-with-* \
    || "${value}" == change-me-* \
    || "${value}" == *example.com* \
    || "${value}" == *@example.com* ]]
}

require_value() {
  local key="$1"
  local value="${2:-}"
  [[ -n "${value}" ]] || fail "${key} is required"
  ! is_placeholder_value "${value}" || fail "${key} still contains a placeholder/example value"
}

require_secret_length() {
  local key="$1"
  local value="${2:-}"
  local minimum="$3"
  require_value "${key}" "${value}"
  [[ "${#value}" -ge "${minimum}" ]] || fail "${key} must be configured with at least ${minimum} characters"
}

require_https_url() {
  local key="$1"
  local value="${2:-}"
  require_value "${key}" "${value}"
  [[ "${value}" == https://* ]] || fail "${key} must use HTTPS in production"
}

[[ "${SHARED_HOST_NGINX:-false}" =~ ^(1|true|yes|on)$ ]] || log "Standalone HTTPS edge selected; ensure this VPS is intended to own public ports 80/443"

if [[ "${FIRST_RUN:-false}" == "true" ]]; then
  [[ "${ALLOW_FIRST_RUN_BOOTSTRAP:-false}" =~ ^(1|true|yes|on)$ ]] || fail "FIRST_RUN=true requires explicit ALLOW_FIRST_RUN_BOOTSTRAP=true; refusing accidental production bootstrap"
  log "Explicit first-run bootstrap mode enabled"
else
  log "Existing or host-provisioned workspace mode enabled"
fi

# Public/runtime topology must be real, not the copy-template example values.
require_value "DOMAIN" "${DOMAIN:-}"
require_https_url "APP_URL" "${APP_URL:-}"
require_https_url "API_URL" "${API_URL:-}"
require_https_url "CORS_ORIGIN" "${CORS_ORIGIN:-}"
if [[ "${SHARED_HOST_NGINX:-false}" =~ ^(1|true|yes|on)$ ]]; then
  require_value "HOST_NGINX_CONFIG_PATH" "${HOST_NGINX_CONFIG_PATH:-}"
else
  require_value "TLS_EMAIL" "${TLS_EMAIL:-}"
fi

# Core persistence/session secrets. These values must agree with the API's
# production validators and must never be accepted merely because they are non-empty.
require_secret_length "POSTGRES_PASSWORD" "${POSTGRES_PASSWORD:-}" 24
require_secret_length "REDIS_PASSWORD" "${REDIS_PASSWORD:-}" 24
require_secret_length "JWT_SECRET" "${JWT_SECRET:-}" 32
require_secret_length "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET:-}" 32
require_value "ENCRYPTION_KEY" "${ENCRYPTION_KEY:-}"
[[ "${ENCRYPTION_KEY}" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "ENCRYPTION_KEY must be exactly 64 hexadecimal characters"

# GenX is the sole remote AI provider for this release. Provider endpoints and
# webhook authentication must be production values before deployment can proceed.
require_value "GENX_API_KEY" "${GENX_API_KEY:-}"
require_https_url "GENX_BASE_URL" "${GENX_BASE_URL:-}"
require_secret_length "GENX_WEBHOOK_SECRET" "${GENX_WEBHOOK_SECRET:-}" 32
require_https_url "GENX_WEBHOOK_URL" "${GENX_WEBHOOK_URL:-}"
require_value "GENX_FX_RATES_TO_GBP" "${GENX_FX_RATES_TO_GBP:-}"
[[ "${GENX_FX_RATES_TO_GBP}" != "{}" ]] || fail "GENX_FX_RATES_TO_GBP must contain the verified release FX rates"

# Operational email is required for password recovery and account operations.
require_value "SMTP_HOST" "${SMTP_HOST:-}"
require_value "SMTP_FROM" "${SMTP_FROM:-}"

# Reusable host-application connector. Generic HOST_APP_* values are canonical;
# the EquiProfile secret remains a compatibility fallback only.
host_connector_key="${HOST_APP_CONNECTOR_KEY:-${EQUIPROFILE_CONNECTOR_KEY:-}}"
require_secret_length "APPLICATION_CONNECTOR_SIGNING_SECRET" "${APPLICATION_CONNECTOR_SIGNING_SECRET:-}" 32
require_secret_length "HOST_APP_CONNECTOR_KEY" "${host_connector_key}" 32
require_secret_length "BACKUP_ENCRYPTION_PASSPHRASE" "${BACKUP_ENCRYPTION_PASSPHRASE:-}" 24

for key in HOST_APP_ID HOST_APP_NAME HOST_APP_URL; do
  value="${!key:-}"
  require_value "${key}" "${value}"
done
[[ "${HOST_APP_ID}" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || fail "HOST_APP_ID must be a stable lowercase slug"
[[ "${HOST_APP_ID}" != "host-app" ]] || fail "HOST_APP_ID still contains the generic template identity"
[[ "${HOST_APP_NAME}" != "Host Application" ]] || fail "HOST_APP_NAME still contains the generic template identity"
[[ "${HOST_APP_URL}" == https://* ]] || fail "HOST_APP_URL must use HTTPS in production"

if [[ -n "${HOST_APP_CONNECTOR_KEY:-}" && -n "${EQUIPROFILE_CONNECTOR_KEY:-}" && "${HOST_APP_CONNECTOR_KEY}" != "${EQUIPROFILE_CONNECTOR_KEY}" ]]; then
  fail "HOST_APP_CONNECTOR_KEY conflicts with the legacy EQUIPROFILE_CONNECTOR_KEY compatibility alias"
fi
if [[ -n "${EQUIPROFILE_APP_ID:-}" && "${EQUIPROFILE_APP_ID}" != "${HOST_APP_ID}" ]]; then
  fail "EQUIPROFILE_APP_ID conflicts with HOST_APP_ID; remove the legacy alias or make it identical"
fi
if [[ -n "${EQUIPROFILE_APP_URL:-}" && "${EQUIPROFILE_APP_URL}" != "${HOST_APP_URL}" ]]; then
  fail "EQUIPROFILE_APP_URL conflicts with HOST_APP_URL; remove the legacy alias or make it identical"
fi

if [[ -n "${STRIPE_SECRET_KEY:-}" || -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  [[ "${STRIPE_SECRET_KEY:-}" == sk_* ]] || fail "STRIPE_SECRET_KEY is non-empty but not a valid-looking Stripe secret"
  [[ "${STRIPE_WEBHOOK_SECRET:-}" == whsec_* ]] || fail "STRIPE_WEBHOOK_SECRET is non-empty but not a valid-looking Stripe webhook secret"
else
  log "Stripe credit checkout remains disabled unless deliberately configured and accepted"
fi

log "Release gate passed"
log "Reviewed Marketing SHA: ${reviewed_sha}"
log "Host application: ${HOST_APP_ID} (${HOST_APP_URL})"
log "Production runtime, connector and encrypted-backup prerequisites: configured"
