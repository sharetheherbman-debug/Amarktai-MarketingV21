#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BASE_COMPOSE="${ROOT_DIR}/docker/docker-compose.yml"
PRODUCTION_COMPOSE="${ROOT_DIR}/docker/docker-compose.production.yml"

log() {
  printf '[amarktai] %s\n' "$*"
}

fail() {
  printf '[amarktai] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

load_production_env() {
  [[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}. Copy .env.production.example and fill in the real values."
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
}

shared_host_nginx_enabled() {
  [[ "${SHARED_HOST_NGINX:-false}" =~ ^(1|true|yes|on)$ ]]
}

compose() {
  local args=(
    --env-file "${ENV_FILE}"
    -f "${BASE_COMPOSE}"
  )

  if ! shared_host_nginx_enabled; then
    args+=( -f "${PRODUCTION_COMPOSE}" )
  fi

  docker compose "${args[@]}" "$@"
}

container_health() {
  local service="$1"
  local container_id
  container_id="$(compose ps -q "${service}")"
  [[ -n "${container_id}" ]] || {
    printf 'missing'
    return
  }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}"
}
