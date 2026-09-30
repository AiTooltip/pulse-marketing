#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo 'Install Node.js 22 or newer, then double-click Open Pulse.command again.'
  exit 1
fi
if [ ! -f node_modules/vite/package.json ]; then npm ci; fi

npm start &
start_pid=$!

# npm start builds the interface if needed and checks that this port belongs to
# this folder. Wait for that same verified service before opening the browser.
attempt=0
while [ "$attempt" -lt 120 ]; do
  if node --input-type=module -e 'import { health } from "./scripts/runtime.mjs"; if (!(await health())) process.exit(1)' >/dev/null 2>&1; then
    open "http://127.0.0.1:${PORT:-4310}/"
    wait "$start_pid"
    exit $?
  fi
  if ! kill -0 "$start_pid" 2>/dev/null; then
    wait "$start_pid"
    exit $?
  fi
  attempt=$((attempt + 1))
  sleep 0.5
done

echo 'Pulse did not become ready. Check the startup error above.'
exit 1
