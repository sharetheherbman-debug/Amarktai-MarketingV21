#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

stage="${1:-core}"
case "${stage}" in
  core|workers|full) ;;
  *) fail "Usage: bash scripts/vps-deploy.sh [core|workers|full]" ;;
esac

bash "${SCRIPT_DIR}/vps-preflight.sh"
bash "${SCRIPT_DIR}/vps-release-gate.sh"
load_production_env

on_error() {
  log "Deployment stage '${stage}' failed. Recent service state follows."
  compose ps || true
  compose logs --tail=120 api generation-worker longform-still-worker render-worker web nginx 2>/dev/null || true
  if ! shared_host_nginx_enabled; then compose logs --tail=120 caddy 2>/dev/null || true; fi
}
trap on_error ERR

if [[ "${stage}" == "core" || "${stage}" == "full" ]]; then
  log "Pulling pinned infrastructure images"
  if shared_host_nginx_enabled; then
    compose pull postgres redis nginx
  else
    compose pull postgres redis nginx caddy
  fi

  log "Building application, migration and all worker images without starting workers"
  compose build --pull api generation-worker longform-still-worker render-worker web migrate

  log "Starting PostgreSQL and Redis"
  compose up -d postgres redis

  log "Running additive database migrations"
  compose run --rm migrate

  if shared_host_nginx_enabled; then
    log "Starting API, web and loopback Nginx only; generation/render workers remain held"
    compose up -d api web nginx
  else
    log "Starting API, web, Nginx and HTTPS edge only; generation/render workers remain held"
    compose up -d api web nginx caddy
  fi

  log "Waiting for core application readiness"
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
  [[ "${ready}" == "1" ]] || fail "Core application did not become ready within six minutes"

  bash "${SCRIPT_DIR}/vps-smoke.sh" core
fi

if [[ "${stage}" == "workers" || "${stage}" == "full" ]]; then
  log "Starting generation worker with conservative production settings"
  compose up -d generation-worker
  bash "${SCRIPT_DIR}/vps-smoke.sh" worker-generation

  log "Starting long-form still-motion worker"
  compose up -d longform-still-worker
  bash "${SCRIPT_DIR}/vps-smoke.sh" worker-longform

  log "Starting render worker"
  compose up -d render-worker
  bash "${SCRIPT_DIR}/vps-smoke.sh" full
fi

compose ps
trap - ERR
log "Deployment stage '${stage}' completed successfully for ${DOMAIN}"
