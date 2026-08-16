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

[[ "${FIRST_RUN:-false}" != "true" ]] || fail "FIRST_RUN=true is not allowed for this existing production workspace; preserve the current owner/workspace and use Management provisioning/SSO"
[[ "${SHARED_HOST_NGINX:-false}" =~ ^(1|true|yes|on)$ ]] || log "Standalone HTTPS edge selected; ensure this VPS is intended to own public ports 80/443"

for key in APPLICATION_CONNECTOR_SIGNING_SECRET EQUIPROFILE_CONNECTOR_KEY BACKUP_ENCRYPTION_PASSPHRASE; do
  value="${!key:-}"
  [[ "${#value}" -ge 24 ]] || fail "${key} must be configured with at least 24 characters"
  [[ "${value}" != replace-with-* ]] || fail "${key} still contains a placeholder"
done

if [[ -n "${HOST_APP_CONNECTOR_KEY:-}" && "${HOST_APP_CONNECTOR_KEY}" != "${EQUIPROFILE_CONNECTOR_KEY}" ]]; then
  fail "HOST_APP_CONNECTOR_KEY and EQUIPROFILE_CONNECTOR_KEY conflict; use the same EquiProfile connector secret or leave HOST_APP_CONNECTOR_KEY empty"
fi

if [[ -n "${STRIPE_SECRET_KEY:-}" || -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  [[ "${STRIPE_SECRET_KEY:-}" == sk_* ]] || fail "STRIPE_SECRET_KEY is non-empty but not a valid-looking Stripe secret"
  [[ "${STRIPE_WEBHOOK_SECRET:-}" == whsec_* ]] || fail "STRIPE_WEBHOOK_SECRET is non-empty but not a valid-looking Stripe webhook secret"
else
  log "Stripe credit checkout remains disabled for controlled Phase 1 proving"
fi

log "Release gate passed"
log "Reviewed Marketing SHA: ${reviewed_sha}"
log "Existing owner/workspace preservation: enforced"
log "Connector and encrypted-backup prerequisites: configured"
