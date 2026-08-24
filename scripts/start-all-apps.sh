#!/bin/bash
# Start all FRVV frontend apps in parallel
# Usage: ./scripts/start-all-apps.sh

set -e

APPS_DIR="$(cd "$(dirname "$0")/../apps" && pwd)"

echo "🥋 Starting FRVV Frontend Apps..."
echo ""
echo "  Competition Admin  → http://localhost:5173"
echo "  Athlete Enrollment → http://localhost:5174"
echo "  Coach Dashboard    → http://localhost:5175"
echo "  Referee Scoring    → http://localhost:5176"
echo "  Public Display     → http://localhost:5177"
echo "  Public Registry    → http://localhost:5178"
echo ""

# Start all dev servers in background
(cd "$APPS_DIR/competition-admin" && npm run dev) &
(cd "$APPS_DIR/athlete-enrollment" && npm run dev) &
(cd "$APPS_DIR/coach-dashboard" && npm run dev) &
(cd "$APPS_DIR/referee-scoring" && npm run dev) &
(cd "$APPS_DIR/public-display" && npm run dev) &
(cd "$APPS_DIR/public-registry" && npm run dev) &

echo "All apps started. Press Ctrl+C to stop all."
wait
