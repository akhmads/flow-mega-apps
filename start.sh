#!/usr/bin/env bash
# ============================================================
# FLOW Mega Apps — Local Dev Server (v3.9)
#
# Usage:
#   ./start.sh           # serves on default port 8080
#   ./start.sh 9000      # serves on port 9000
#
# Requires: Python 3 (preinstalled on macOS / Linux / Windows w/ WSL)
#
# What this does:
#   1. Verifies you're in OFFLINE/PREVIEW mode (no Firebase required)
#   2. Verifies the firebase-applet-config.json is empty (demo mode)
#   3. Starts a local HTTP server (ES modules need HTTP — file:// fails)
#   4. Tries to auto-open your browser to the right URL
#
# Once running, click any demo account on the login screen — no
# password needed (auto-fills "demo"). Try each role to feel the
# permission model:
#   👁️  admin@demo               → read-only super-viewer
#   ✏️  supervisor.sales@demo     → full edit power
#   ✏️  supervisor.ss@demo        → full edit power
#   👤  user.sales@demo           → limited (own records)
#   👤  user.ss@demo              → limited (own records)
# ============================================================

set -euo pipefail

PORT="${1:-8080}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# --- Sanity checks ---------------------------------------------------
if [ ! -f "index.html" ] || [ ! -f "js/app.js" ]; then
  echo "❌ This script must be run from the flow-mega-apps folder."
  echo "   Current directory: $(pwd)"
  exit 1
fi

# Confirm PREVIEW_MODE is on (so demo accounts work without Firebase)
if ! grep -q "^const PREVIEW_MODE = true" js/app.js; then
  echo "⚠️  PREVIEW_MODE is OFF in js/app.js."
  echo "   For local testing you probably want it ON."
  echo "   Change line:   const PREVIEW_MODE = false;"
  echo "          to:     const PREVIEW_MODE = true;"
  echo ""
  read -r -p "Continue anyway? [y/N] " ans
  case "$ans" in [yY]*) ;; *) exit 1 ;; esac
fi

# Pick a Python binary
PY=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
  echo "❌ Python 3 not found. Install it from python.org, or use:"
  echo "   npx http-server -p $PORT   (if you have Node.js)"
  exit 1
fi

# Port-in-use check
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️  Port $PORT is already in use."
  echo "   Try a different port:  ./start.sh 8090"
  exit 1
fi

URL="http://localhost:$PORT/"

cat <<EOF

  ┌────────────────────────────────────────────────────────────────┐
  │                                                                │
  │   🚀  FLOW Mega Apps — local dev server                        │
  │                                                                │
  │   → $URL                                       │
  │                                                                │
  │   Demo accounts (click on the login screen, no typing):        │
  │     👁️   admin@demo               → read-only (sees all)        │
  │     ✏️   supervisor.sales@demo     → full edit                  │
  │     ✏️   supervisor.ss@demo        → full edit                  │
  │     👤   user.sales@demo           → limited                    │
  │     👤   user.ss@demo              → limited                    │
  │   (all passwords are: demo)                                    │
  │                                                                │
  │   New v21 tools to try:                                        │
  │     📦  Transaction                                            │
  │     📈  Weekly Report Generator                                │
  │                                                                │
  │   Stop:  press Ctrl+C                                          │
  │                                                                │
  └────────────────────────────────────────────────────────────────┘

EOF

# Try to open the browser in the background — non-fatal if it fails.
(
  sleep 0.6
  if command -v open >/dev/null 2>&1; then          # macOS
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then    # Linux
    xdg-open "$URL"
  elif command -v start >/dev/null 2>&1; then       # Windows (Git Bash)
    start "$URL"
  fi
) >/dev/null 2>&1 &

# Serve — `--bind 127.0.0.1` keeps it off the LAN by default. Drop the
# bind flag if you actually want phones on the same Wi-Fi to reach it.
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
