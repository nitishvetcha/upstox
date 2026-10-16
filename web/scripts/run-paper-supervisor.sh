#!/bin/zsh
set -e

# Resolve directories and executables
WEB_DIR="/Users/webanatomy/Desktop/upstox_analyzer (2)/web"
cd "$WEB_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PORT="3123"

echo "[$(date -u)] [WRAPPER] Starting Upstox Paper Live Supervisor Wrapper (PID: $$)..."

# Ensure Next.js server is up
if ! /opt/homebrew/bin/node -e '
  const http = require("http");
  const req = http.get("http://localhost:3123/api/auth/status", (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
  req.on("error", () => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
' 2>/dev/null; then
  echo "[$(date -u)] [WRAPPER] Next.js server not running on port 3123. Starting in background..."
  nohup /opt/homebrew/bin/npx next start -p 3123 >> logs/server.log 2>&1 &
  
  # Wait up to 30 seconds for server to respond
  SERVER_READY=0
  for i in {1..30}; do
    if /opt/homebrew/bin/node -e '
      const http = require("http");
      const req = http.get("http://localhost:3123/api/auth/status", (res) => {
        process.exit(res.statusCode === 200 ? 0 : 1);
      });
      req.on("error", () => process.exit(1));
    ' 2>/dev/null; then
      echo "[$(date -u)] [WRAPPER] Server became healthy."
      SERVER_READY=1
      break
    fi
    sleep 1
  done

  if [ "$SERVER_READY" -ne 1 ]; then
    echo "[$(date -u)] [WRAPPER] ERROR: Server failed to become healthy within 30s. Exiting."
    exit 1
  fi
else
  echo "[$(date -u)] [WRAPPER] Next.js server is already running and healthy."
fi

# Run the live paper runner
echo "[$(date -u)] [WRAPPER] Launching paper-live.mjs..."
exec /opt/homebrew/bin/node scripts/paper-live.mjs
