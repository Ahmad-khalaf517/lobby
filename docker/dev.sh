#!/bin/sh

set -eu

workspace="$1"
shift

shutdown() {
  trap - INT TERM EXIT
  kill "$shared_pid" "$app_pid" 2>/dev/null || true
  wait "$shared_pid" "$app_pid" 2>/dev/null || true
}

trap shutdown INT TERM EXIT

pnpm --filter @lobby/shared dev &
shared_pid=$!

if [ "$#" -gt 0 ]; then
  pnpm --filter "$workspace" dev "$@" &
else
  pnpm --filter "$workspace" dev &
fi
app_pid=$!

wait "$app_pid"
