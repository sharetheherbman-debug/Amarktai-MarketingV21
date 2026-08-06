#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command git
load_production_env

branch="${DEPLOY_BRANCH:-development}"
cd "${ROOT_DIR}"

git diff --quiet && git diff --cached --quiet || fail "Repository has uncommitted changes; refusing to update"
previous_commit="$(git rev-parse HEAD)"

log "Creating pre-update backup"
bash "${SCRIPT_DIR}/vps-backup.sh"

log "Fetching ${branch}"
git fetch --prune origin "${branch}"
git checkout "${branch}"
git pull --ff-only origin "${branch}"
new_commit="$(git rev-parse HEAD)"

if [[ "${new_commit}" == "${previous_commit}" ]]; then
  log "Already current at ${new_commit}; running deployment verification"
fi

if bash "${SCRIPT_DIR}/vps-deploy.sh"; then
  log "Update completed: ${previous_commit} -> ${new_commit}"
  exit 0
fi

log "Update failed; rolling back to ${previous_commit}"
git reset --hard "${previous_commit}"
if bash "${SCRIPT_DIR}/vps-deploy.sh"; then
  fail "Update failed and was rolled back successfully to ${previous_commit}"
fi

fail "Update failed and automatic rollback deployment also failed; inspect Docker logs immediately"
