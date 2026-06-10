#!/usr/bin/env bash
# Serve the Grinbox mockups over HTTP, bound to 0.0.0.0 so it's reachable
# from outside the dev container (LAN, host, other machines on the network).
#
# Usage: ./serve.sh [PORT]   — defaults to 8000

set -euo pipefail

PORT="${1:-8000}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Serving $DIR on port $PORT"
echo
echo "Reachable at:"
ips="$(hostname -I 2>/dev/null || true)"
if [[ -n "$ips" ]]; then
  for ip in $ips; do
    echo "  http://$ip:$PORT/"
  done
fi
echo "  http://localhost:$PORT/   (inside this container only)"
echo
echo "Press Ctrl-C to stop."
echo

cd "$DIR"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
