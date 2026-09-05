#!/bin/bash
# Manage all FRVV frontend apps (and optionally the backend) from one place.
#
# Usage:
#   ./scripts/start-all-apps.sh            Start all frontend dev servers
#   ./scripts/start-all-apps.sh --backend  Also start the Django backend
#   ./scripts/start-all-apps.sh --stop     Stop everything started on the app ports
#
# Logs are written to logs/<app>.log. Press Ctrl+C to stop all foreground apps.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APPS_DIR="$ROOT_DIR/apps"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

# app_name port
APPS=(
  "competition-admin 5173"
  "athlete-enrollment 5174"
  "coach-dashboard 5175"
  "referee-scoring 5176"
  "public-display 5177"
  "public-registry 5178"
)
BACKEND_PORT=8000

stop_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "  Stopping port $port (pids: $pids)"
    kill $pids 2>/dev/null || true
  fi
}

stop_all() {
  echo "🛑 Stopping FRVV apps..."
  for entry in "${APPS[@]}"; do
    stop_port "${entry##* }"
  done
  stop_port "$BACKEND_PORT"
  echo "Done."
}

if [ "${1:-}" = "--stop" ]; then
  stop_all
  exit 0
fi

WITH_BACKEND=false
[ "${1:-}" = "--backend" ] && WITH_BACKEND=true

echo "🥋 Starting FRVV apps..."
echo ""

if [ "$WITH_BACKEND" = true ]; then
  if lsof -ti tcp:"$BACKEND_PORT" >/dev/null 2>&1; then
    echo "  Backend            → already running on http://localhost:$BACKEND_PORT"
  else
    echo "  Backend            → http://localhost:$BACKEND_PORT (logs/backend.log)"
    ( cd "$ROOT_DIR/backend" && python3 manage.py runserver "0.0.0.0:$BACKEND_PORT" ) \
      >"$LOG_DIR/backend.log" 2>&1 &
  fi
fi

for entry in "${APPS[@]}"; do
  name="${entry%% *}"
  port="${entry##* }"
  if lsof -ti tcp:"$port" >/dev/null 2>&1; then
    echo "  $name → port $port already in use, skipping"
    continue
  fi
  printf "  %-18s → http://localhost:%s (logs/%s.log)\n" "$name" "$port" "$name"
  ( cd "$APPS_DIR/$name" && npm run dev ) >"$LOG_DIR/$name.log" 2>&1 &
done

echo ""
echo "All apps started. Press Ctrl+C to stop."

cleanup() {
  echo ""
  stop_all
  exit 0
}
trap cleanup INT TERM

wait
