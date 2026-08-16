#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command git
load_production_env

branch="${DEPLOY_BRANCH:-phase-1/equiprofile-relaunch-genx-credits}"
reviewed_sha="${DEPLOY_SHA:-}"
[[ "${reviewed_sha}" =~ ^[0-9a-f]{40}$ ]] || fail "DEPLOY_SHA must be the exact reviewed 40-character Marketing SHA"
cd "${ROOT_DIR}"

git diff --quiet && git diff --cached --quiet || fail "Repository has uncommitted changes; refusing to update"
previous_commit="$(git rev-parse HEAD)"

log "Creating complete encrypted pre-update rollback bundle"
bash "${SCRIPT_DIR}/vps-backup.sh"

log "Fetching reviewed branch ${branch}"
git fetch --prune origin "${branch}"
git cat-file -e "${reviewed_sha}^{commit}" 2>/dev/null || fail "Reviewed DEPLOY_SHA ${reviewed_sha} was not fetched"
git merge-base --is-ancestor "${reviewed_sha}" "origin/${branch}" || fail "Reviewed DEPLOY_SHA is not reachable from origin/${branch}"

remote_head="$(git rev-parse "origin/${branch}")"
if [[ "${remote_head}" != "${reviewed_sha}" ]]; then
  log "NOTICE: branch head ${remote_head} differs from reviewed DEPLOY_SHA; deployment remains pinned to ${reviewed_sha}"
fi

log "Checking out exact reviewed SHA ${reviewed_sha} in detached release state"
git checkout --detach "${reviewed_sha}"
new_commit="$(git rev-parse HEAD)"
[[ "${new_commit}" == "${reviewed_sha}" ]] || fail "Exact reviewed SHA checkout failed"

if bash "${SCRIPT_DIR}/vps-deploy.sh" core; then
  log "Core update completed: ${previous_commit} -> ${new_commit}; workers remain held"
  exit 0
fi

log "Core update failed; returning source to previous commit ${previous_commit}"
git checkout --detach "${previous_commit}"
# The release gate intentionally pins the new DEPLOY_SHA, so use the previous
# deployment script directly only after temporarily scoping DEPLOY_SHA to the
# previous known source. This does not change the persistent environment file.
if DEPLOY_SHA="${previous_commit}" bash "${SCRIPT_DIR}/vps-deploy.sh" core; then
  fail "Update failed and core services were restored to previous source ${previous_commit}. Inspect logs before retrying."
fi

fail "Update failed and automatic source rollback also failed; use the encrypted rollback bundle and inspect Docker logs immediately"
