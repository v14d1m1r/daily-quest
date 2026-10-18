#!/usr/bin/env bash
# Restores into a uniquely named temporary database, never the production database.
set -euo pipefail
if [[ $# != 2 ]]; then echo 'Usage: bash scripts/restore-check.sh ARCHIVE.dump.age AGE_IDENTITY_FILE' >&2; exit 2; fi
archive=$(realpath "$1")
identity=$(realpath "$2")
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v age >/dev/null
check_db="dq_verify_$(date +%s)_${RANDOM}"
compose=(bash scripts/production.sh)
"${compose[@]}" exec -T db createdb -U dailyquest "$check_db"
trap '"${compose[@]}" exec -T db dropdb -U dailyquest --if-exists "$check_db"' EXIT
age -d -i "$identity" "$archive" | "${compose[@]}" exec -T db pg_restore -U dailyquest -d "$check_db" --no-owner --no-acl --exit-on-error --single-transaction
"${compose[@]}" exec -T db psql -U dailyquest -d "$check_db" -v ON_ERROR_STOP=1 -c 'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM water_entries) AS water_entries, (SELECT count(*) FROM meals) AS meals, (SELECT count(*) FROM tasks) AS tasks;'
echo 'Restore check passed. Temporary database will be removed.'
