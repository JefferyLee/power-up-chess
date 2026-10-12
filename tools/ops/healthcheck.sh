#!/usr/bin/env bash
# External health check for Power Up Chess. No credentials needed.
#
#   tools/ops/healthcheck.sh            curl-only checks (~5 s)
#   tools/ops/healthcheck.sh --browser  + drive both origins with
#                                       e2e/preview-smoke.mjs (needs `pnpm install`
#                                       and `pnpm exec playwright install chromium`)
#
# One line per check. Exit 0 = all passed, 1 = at least one FAIL.
# What each failure usually means: docs/OPS_RUNBOOK.md §Failure catalog.
set -u
ORIGINS=(https://app.powerupcastle.app https://power-up-chess-dev.web.app)
FN=https://us-central1-power-up-chess-dev.cloudfunctions.net/submitSiegeScore
fail=0
ok()  { echo "OK   $1"; }
bad() { echo "FAIL $1"; fail=1; }

for o in "${ORIGINS[@]}"; do
  html=$(curl -sS --max-time 15 "$o/" 2>&1) || { bad "$o GET / ($html)"; continue; }
  if grep -q '<div id="root"' <<<"$html"; then ok "$o index.html"; else bad "$o index.html has no #root"; fi
  asset=$(grep -oE 'assets/index-[^"]+\.js' <<<"$html" | head -1)
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$o/$asset")
  if [ "$code" = 200 ]; then ok "$o $asset"; else bad "$o $asset -> HTTP $code"; fi
  cc=$(curl -sI --max-time 15 "$o/sw.js" | tr -d '\r' | grep -i '^cache-control:')
  if grep -qi 'no-cache' <<<"$cc"; then ok "$o sw.js is no-cache"; else bad "$o sw.js cache-control: ${cc:-missing} (PWA updates stall)"; fi
done

# Cloud Functions: an unauthenticated call must get the function's OWN 401.
# A 403 means the Cloud Run invoker (allUsers) is missing; 5xx = crashed.
resp=$(curl -sS --max-time 20 -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"data":{}}' "$FN" 2>&1)
code=${resp##*$'\n'}
if [ "$code" = 401 ] && grep -q UNAUTHENTICATED <<<"$resp"; then
  ok "functions: submitSiegeScore answers 401 UNAUTHENTICATED"
else
  bad "functions: submitSiegeScore -> HTTP $code (expected its own 401; 403 = invoker missing)"
fi

if [ "${1:-}" = --browser ]; then
  repo=$(cd "$(dirname "$0")/../.." && pwd)
  log=$(mktemp)
  for o in "${ORIGINS[@]}"; do
    if (cd "$repo" && node e2e/preview-smoke.mjs "$o" > "$log" 2>&1); then
      ok "browser probe $o"
    else
      bad "browser probe $o"; sed 's/^/       /' "$log" | tail -12
    fi
  done
  rm -f "$log"
fi

if [ $fail = 0 ]; then echo "all good"; else echo "FAILURES — see docs/OPS_RUNBOOK.md"; fi
exit $fail
