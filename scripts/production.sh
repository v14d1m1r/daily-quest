#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose_files=(-f compose.production.yaml)
if [[ -f compose.proxy.yaml ]]; then
  compose_files+=(-f compose.proxy.yaml)
fi
exec docker compose --env-file .env.production "${compose_files[@]}" "$@"
