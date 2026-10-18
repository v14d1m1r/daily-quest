#!/usr/bin/env bash
# Explicit disaster-recovery operation. Take a fresh backup before invoking.
set -euo pipefail
if [[ $# != 2 ]]; then echo 'Usage: bash scripts/restore.sh ARCHIVE.dump.age AGE_IDENTITY_FILE' >&2; exit 2; fi
archive=$(realpath "$1")
identity=$(realpath "$2")
cd "$(dirname "${BASH_SOURCE[0]}")/.."
bash scripts/restore-check.sh "$archive" "$identity"
read -r -p 'Replace ALL Daily Quest production data? Type RESTORE dailyquest: ' confirmation
[[ "$confirmation" == 'RESTORE dailyquest' ]] || exit 1
compose=(bash scripts/production.sh)
"${compose[@]}" stop app
# Atomic restore; on failure app remains stopped for investigation.
age -d -i "$identity" "$archive" | "${compose[@]}" exec -T db pg_restore -U dailyquest -d dailyquest --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction
"${compose[@]}" exec -T db psql -U dailyquest -d dailyquest -v ON_ERROR_STOP=1 -c 'DELETE FROM sessions;'
echo 'Database restored; sessions revoked. Choose the compatible APP_TAG, then start app with production.sh up -d --no-build --wait app.'
