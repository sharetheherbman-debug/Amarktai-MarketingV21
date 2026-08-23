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

[[ "${SHARED_HOST_NGINX:-false}" =~ ^(1|true|yes|on)$ ]] || log "Standalone HTTPS edge selected; ensure this VPS is intended to own public ports 80/443"

if [[ "${FIRST_RUN:-false}" == "true" ]]; then
  [[ "${ALLOW_FIRST_RUN_BOOTSTRAP:-false}" =~ ^(1|true|yes|on)$ ]] || fail "FIRST_RUN=true requires explicit ALLOW_FIRST_RUN_BOOTSTRAP=true; refusing accidental production bootstrap"
  log "Explicit first-run bootstrap mode enabled"
else
  log "Existing or host-provisioned workspace mode enabled"
fi

host_connector_key="${HOST_APP_CONNECTOR_KEY:-${EQUIPROFILE_CONNECTOR_KEY:-}}"
required_pairs=(
  "APPLICATION_CONNECTOR_SIGNING_SECRET:${APPLICATION_CONNECTOR_SIGNING_SECRET:-}"
  "HOST_APP_CONNECTOR_KEY:${host_connector_key}"
  "BACKUP_ENCRYPTION_PASSPHRASE:${BACKUP_ENCRYPTION_PASSPHRASE:-}"
)
for pair in "${required_pairs[@]}"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  [[ "${#value}" -ge 24 ]] || fail "${key} must be configured with at least 24 characters"
  [[ "${value}" != replace-with-* && "${value}" != change-me-* ]] || fail "${key} still contains a placeholder"
done

for key in HOST_APP_ID HOST_APP_NAME HOST_APP_URL; do
  value="${!key:-}"
  [[ -n "${value}" ]] || fail "${key} is required for a production host application connector"
  [[ "${value}" != replace-with-* && "${value}" != change-me-* ]] || fail "${key} still contains a placeholder"
done
[[ "${HOST_APP_ID}" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || fail "HOST_APP_ID must be a stable lowercase slug"
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
log "Connector and encrypted-backup prerequisites: configured"
