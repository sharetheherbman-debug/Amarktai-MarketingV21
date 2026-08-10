#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

bash "${SCRIPT_DIR}/vps-preflight.sh"
load_production_env

on_error() {
  log "Deployment failed. Recent service logs follow."
  compose ps || true
  if shared_host_nginx_enabled; then
    compose logs --tail=120 api generation-worker render-worker web nginx || true
  else
    compose logs --tail=120 api generation-worker render-worker web nginx caddy || true
  fi
}
trap on_error ERR

log "Pulling base images"
if shared_host_nginx_enabled; then
  compose pull postgres redis nginx
else
  compose pull postgres redis nginx caddy
fi

log "Building application images"
compose build --pull api generation-worker render-worker web migrate

log "Starting PostgreSQL and Redis"
compose up -d postgres redis

log "Running database migrations"
compose run --rm migrate

if shared_host_nginx_enabled; then
  log "Starting application and loopback edge behind the existing host Nginx"
  compose up -d api generation-worker render-worker web nginx
else
  log "Starting application, workers and HTTPS edge"
  compose up -d api generation-worker render-worker web nginx caddy
fi

log "Waiting for https://${DOMAIN}/ready"
ready=0
for _attempt in $(seq 1 72); do
  if curl --fail --silent --show-error --max-time 10 "https://${DOMAIN}/ready" | grep -q '"status":"ready"'; then
    ready=1
    break
  fi
  sleep 5
done

[[ "${ready}" == "1" ]] || fail "Application did not become ready within six minutes"

bash "${SCRIPT_DIR}/vps-smoke.sh"
compose ps
trap - ERR
log "Deployment completed successfully: https://${DOMAIN}"
