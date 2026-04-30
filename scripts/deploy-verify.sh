#!/usr/bin/env bash
# Post-deploy smoke test for MusicCollabHub.
#
# Usage:
#   ./scripts/deploy-verify.sh https://your-deploy.vercel.app
#   BASE_URL=https://your-deploy.vercel.app ./scripts/deploy-verify.sh
#
# Exits 0 if all checks pass, non-zero on first failure.
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
if [[ -z "${BASE_URL}" ]]; then
  echo "ERROR: pass deploy URL as arg or via BASE_URL env var" >&2
  echo "Usage: $0 <https://deploy-url>" >&2
  exit 2
fi
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }

step() { printf "\n→ %s\n" "$1"; }

# ── 1. /api/health (overall liveness + DB + env contract) ───────────────────
step "GET ${BASE_URL}/api/health"
HEALTH_BODY="$(mktemp)"
HEALTH_CODE="$(curl -sS -o "${HEALTH_BODY}" -w '%{http_code}' \
  --max-time 30 "${BASE_URL}/api/health" || echo "000")"

if [[ "${HEALTH_CODE}" == "200" ]]; then
  ok "health endpoint reachable (200)"
else
  fail "health endpoint returned HTTP ${HEALTH_CODE}"
  cat "${HEALTH_BODY}" >&2 || true
fi

if grep -q '"database":{"status":"ok"' "${HEALTH_BODY}"; then
  ok "database connection ok"
else
  fail "database check did not report ok"
  cat "${HEALTH_BODY}" >&2 || true
fi

if grep -q '"env":{"status":"ok"' "${HEALTH_BODY}"; then
  ok "required env vars set"
else
  fail "env check did not report ok"
  cat "${HEALTH_BODY}" >&2 || true
fi
rm -f "${HEALTH_BODY}"

# ── 2. Public landing page renders ──────────────────────────────────────────
step "GET ${BASE_URL}/"
ROOT_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  --max-time 30 "${BASE_URL}/" || echo "000")"
if [[ "${ROOT_CODE}" == "200" ]]; then
  ok "landing page renders (200)"
else
  fail "landing page returned HTTP ${ROOT_CODE}"
fi

# ── 3. Stripe webhook endpoint reachable (rejects unsigned with 400) ────────
# An unsigned POST should be rejected by signature verification — proves the
# route is wired and reachable, without sending a real event.
step "POST ${BASE_URL}/api/webhooks/stripe (expect 400 unsigned)"
HOOK_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  --max-time 30 -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' "${BASE_URL}/api/webhooks/stripe" || echo "000")"
if [[ "${HOOK_CODE}" == "400" || "${HOOK_CODE}" == "401" ]]; then
  ok "stripe webhook reachable, rejects unsigned (${HOOK_CODE})"
else
  fail "stripe webhook unexpected HTTP ${HOOK_CODE} (expected 400/401)"
fi

# ── 4. Cron route auth gate (expect 401 without secret) ─────────────────────
step "GET ${BASE_URL}/api/cron/expire-trials (expect 401 unauthenticated)"
CRON_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  --max-time 30 "${BASE_URL}/api/cron/expire-trials" || echo "000")"
if [[ "${CRON_CODE}" == "401" ]]; then
  ok "cron route reachable, auth-gated (401)"
elif [[ "${CRON_CODE}" == "500" ]]; then
  fail "cron route reached but CRON_SECRET not configured in deploy env"
else
  fail "cron route unexpected HTTP ${CRON_CODE} (expected 401)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────"
echo "  ${PASS} passed, ${FAIL} failed"
echo "──────────────────────────────────────────"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
