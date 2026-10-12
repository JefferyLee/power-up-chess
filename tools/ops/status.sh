#!/usr/bin/env bash
# Internal status: latest CI / Deploy runs and recent Cloud Functions errors.
#
#   tools/ops/status.sh          last 2 h of function errors
#   HOURS=24 tools/ops/status.sh
#
# Needs `gh` logged in with access to the repo; the log section needs `gcloud`
# logged in as an account with roles/logging.viewer on power-up-chess-dev
# (docs/OPS_RUNBOOK.md §Access). Read-only.
set -u
cd "$(dirname "$0")/../.."
HOURS=${HOURS:-2}
echo "== GitHub Actions, newest first (CI must be green before Deploy runs)"
gh run list --limit 6 --json name,status,conclusion,createdAt,headSha,event \
  --jq '.[] | "\(.createdAt)  \(.name)  \(.status)/\(.conclusion // "-")  \(.headSha[0:7])  \(.event)"'
echo "== Cloud Functions errors, last ${HOURS}h"
if gcloud auth print-access-token >/dev/null 2>&1; then
  since=$(date -u -v-"${HOURS}"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-${HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)
  gcloud logging read "resource.type=\"cloud_run_revision\" AND severity>=ERROR AND timestamp>=\"$since\"" \
    --project power-up-chess-dev --limit 30 \
    --format='value(timestamp,resource.labels.service_name,textPayload,jsonPayload.message)' | cut -c1-240
else
  echo "(gcloud is not logged in; skipped)"
fi
