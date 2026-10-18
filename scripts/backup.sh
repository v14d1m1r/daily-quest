#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
: "${AGE_RECIPIENT:?Set AGE_RECIPIENT to your public age recipient}"
command -v age >/dev/null
backup_dir="${BACKUP_DIR:-$PWD/backups}"
mkdir -p "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || { echo 'Backup already running' >&2; exit 1; }
archive="$backup_dir/dailyquest-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
temporary=$(mktemp "$backup_dir/.partial.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
bash scripts/production.sh exec -T db pg_dump -U dailyquest -d dailyquest --format=custom --no-owner --no-acl | age -r "$AGE_RECIPIENT" > "$temporary"
test -s "$temporary"
mv -- "$temporary" "$archive"
echo "Backup saved: $archive"
# No automatic deletion: retain copies until off-server delivery is verified.
