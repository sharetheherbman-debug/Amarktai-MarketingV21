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
require_command python3

load_production_env

required_variables=(
  DOMAIN TLS_EMAIL APP_URL API_URL CORS_ORIGIN
  POSTGRES_PASSWORD REDIS_PASSWORD JWT_SECRET JWT_REFRESH_SECRET
  ENCRYPTION_KEY GENX_API_KEY GENX_BASE_URL DEFAULT_TEXT_MODEL GENX_WEBHOOK_SECRET GENX_WEBHOOK_URL
  GENX_PROVIDER_CREDITS_PER_USD GENX_FX_RATES_TO_GBP
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
[[ "${GENX_PROVIDER_CREDITS_PER_USD}" == "100" ]] || fail "GENX_PROVIDER_CREDITS_PER_USD must be 100 for the verified GenX Router accounting contract"

python3 - "${GENX_FX_RATES_TO_GBP}" <<'PY' || fail "GENX_FX_RATES_TO_GBP must be valid JSON with a positive USD-to-GBP rate"
import json
import math
import sys
rates = json.loads(sys.argv[1])
if not isinstance(rates, dict):
    raise SystemExit(1)
usd = float(rates.get('USD', 0))
if not math.isfinite(usd) or usd <= 0:
    raise SystemExit(1)
PY

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
genx_request() {
  curl --fail --silent --show-error --location \
    --retry 2 --retry-delay 2 --connect-timeout 10 --max-time 45 \
    -H "Authorization: Bearer ${GENX_API_KEY}" \
    "$1"
}

validate_catalogue() {
  local category="$1"
  local payload="$2"
  python3 - "$category" "$payload" <<'PY'
import json
import sys
category, text = sys.argv[1], sys.argv[2]
raw = json.loads(text)

def items(value):
    if isinstance(value, list):
        return value
    if not isinstance(value, dict):
        return []
    for key in ('data', 'models', 'items', 'results'):
        child = value.get(key)
        if isinstance(child, list):
            return child
        if isinstance(child, dict):
            for nested in ('models', 'items', 'results', 'data'):
                nested_value = child.get(nested)
                if isinstance(nested_value, list):
                    return nested_value
    return []

rows = items(raw)
if not rows:
    raise SystemExit(f'{category} catalogue is empty')
identifiable = 0
for row in rows:
    if isinstance(row, str) and row.strip():
        identifiable += 1
    elif isinstance(row, dict) and any(row.get(k) for k in ('id', 'model_id', 'model', 'slug')):
        identifiable += 1
if identifiable != len(rows):
    raise SystemExit(f'{category} catalogue contains unidentifiable entries')
print(f'[amarktai] GenX {category} catalogue: {len(rows)} identifiable models')
PY
}

validate_account_pricing() {
  local category="$1"
  local payload="$2"
  python3 - "$category" "$payload" <<'PY'
import json
import math
import sys
category, text = sys.argv[1], sys.argv[2]
raw = json.loads(text)

def items(value):
    if isinstance(value, list):
        return value
    if not isinstance(value, dict):
        return []
    for key in ('data', 'pricing', 'prices', 'models', 'items', 'results'):
        child = value.get(key)
        if isinstance(child, list):
            return child
        if isinstance(child, dict):
            for nested in ('pricing', 'prices', 'models', 'items', 'results', 'data'):
                nested_value = child.get(nested)
                if isinstance(nested_value, list):
                    return nested_value
    return []

rows = items(raw)
if not rows:
    raise SystemExit(f'{category} account pricing is empty')

price_count = 0
priced_models = 0
unpriced_models = []

for row in rows:
    if not isinstance(row, dict):
        raise SystemExit(f'{category} account pricing contains a non-object record')

    model_id = str(row.get('model') or row.get('model_id') or row.get('id') or '').strip()
    if not model_id:
        raise SystemExit(f'{category} account pricing contains a record without model identity')

    prices = row.get('pricing')
    if prices is None or prices == []:
        # GenX may catalogue a model before/after a billable rate is available.
        # Production runtime treats this exact state as unpriced and forces
        # retail_enabled=FALSE; it must not block other safely priced models.
        unpriced_models.append(model_id)
        continue

    if not isinstance(prices, list):
        raise SystemExit(f'{category} account pricing contains a non-array pricing contract for {model_id}')

    priced_models += 1
    for price in prices:
        if not isinstance(price, dict) or not str(price.get('metric') or '').strip():
            raise SystemExit(f'{category} account pricing contains a row without metric')
        unit = float(price.get('unit_quantity', 0))
        credits = float(price.get('credits', -1))
        mcredits = float(price.get('mcredits', -1))
        if not all(math.isfinite(v) for v in (unit, credits, mcredits)) or unit <= 0 or credits < 0 or mcredits < 0:
            raise SystemExit(f'{category} account pricing contains invalid numeric values')
        if abs(credits - (mcredits / 1000.0)) > max(0.000001, abs(credits) * 0.000001):
            raise SystemExit(f'{category} account pricing credits/mcredits mismatch')
        price_count += 1

if priced_models == 0 or price_count == 0:
    raise SystemExit(f'{category} account pricing contains no safely billable models')

print(
    f'[amarktai] GenX {category} account pricing: '
    f'{len(rows)} models / {priced_models} priced / '
    f'{len(unpriced_models)} unpriced / {price_count} metric rows'
)
if unpriced_models:
    preview = ', '.join(unpriced_models[:10])
    suffix = '' if len(unpriced_models) <= 10 else f' (+{len(unpriced_models) - 10} more)'
    print(
        f'[amarktai] WARNING: GenX {category} models without account pricing '
        f'will remain retail-disabled: {preview}{suffix}'
    )
PY
}

log "Verifying GenX streaming text model access"
text_catalogue="$(genx_request "${genx_base}/v1/models")" || fail "GenX streaming text catalogue request failed; verify GENX_API_KEY and GENX_BASE_URL"
[[ -n "${text_catalogue}" ]] || fail "GenX streaming text catalogue returned an empty response"
grep -Fq "${DEFAULT_TEXT_MODEL}" <<<"${text_catalogue}" || fail "DEFAULT_TEXT_MODEL ${DEFAULT_TEXT_MODEL} is not present in the GenX streaming text catalogue"

for category in text image video voice audio; do
  log "Verifying GenX ${category} Router catalogue contract"
  catalogue="$(genx_request "${genx_base}/api/v1/models?category=${category}")" || fail "GenX ${category} catalogue request failed"
  validate_catalogue "${category}" "${catalogue}" || fail "GenX ${category} catalogue returned an unsupported contract"

  log "Verifying GenX ${category} authenticated account pricing"
  account_pricing="$(genx_request "${genx_base}/api/v1/account/pricing?category=${category}")" || fail "GenX ${category} account pricing request failed"
  validate_account_pricing "${category}" "${account_pricing}" || fail "GenX ${category} account pricing returned an unsupported contract"
done

if ! genx_request "${genx_base}/api/v1/account/credits" >/dev/null; then
  log "WARNING: GenX credit-balance endpoint was unavailable. Catalogue and account pricing access passed, but confirm sufficient account credit before acceptance generation."
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
log "Compose configuration, GenX catalogues and authenticated tier pricing are valid"
