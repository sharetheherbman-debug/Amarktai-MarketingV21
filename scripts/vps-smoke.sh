#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/vps-common.sh
source "${SCRIPT_DIR}/lib/vps-common.sh"

require_command curl
require_command docker
load_production_env

base_url="https://${DOMAIN}"

wait_for_service() {
  local service="$1"
  local health
  for _attempt in $(seq 1 60); do
    health="$(container_health "${service}")"
    if [[ "${health}" == "healthy" || "${health}" == "running" ]]; then
      log "PASS ${service} (${health})"
      return 0
    fi
    if [[ "${health}" == "unhealthy" || "${health}" == "exited" || "${health}" == "dead" ]]; then
      compose logs --tail=100 "${service}" || true
      fail "${service} entered terminal health state: ${health}"
    fi
    sleep 5
  done
  compose logs --tail=100 "${service}" || true
  fail "${service} did not become healthy within five minutes; last state: ${health:-unknown}"
}

check_url() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local body
  body="$(curl --fail --silent --show-error --location --max-time 30 "${url}")" || fail "${label} failed: ${url}"
  [[ "${body}" == *"${expected}"* ]] || fail "${label} returned an unexpected response"
  log "PASS ${label}"
}

services=(postgres redis api generation-worker render-worker web nginx)
if ! shared_host_nginx_enabled; then
  services+=(caddy)
fi
for service in "${services[@]}"; do
  wait_for_service "${service}"
done

if shared_host_nginx_enabled; then
  check_url "loopback edge readiness" "http://127.0.0.1:${HTTP_PORT:-8080}/ready" '"status":"ready"'
fi

check_url "edge health" "${base_url}/health" '"status":"ok"'
check_url "application readiness" "${base_url}/ready" '"status":"ready"'
check_url "API health" "${base_url}/api/v1/health" '"status":"ok"'
check_url "API version" "${base_url}/api/v1/health/version" '"success":true'

home_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 "${base_url}/")"
[[ "${home_status}" =~ ^(200|301|302|307|308)$ ]] || fail "Homepage returned HTTP ${home_status}"
log "PASS homepage (${home_status})"

login_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 "${base_url}/login")"
[[ "${login_status}" =~ ^(200|301|302|307|308)$ ]] || fail "Login page returned HTTP ${login_status}"
log "PASS login page (${login_status})"

log "Production smoke test passed for ${base_url}"
