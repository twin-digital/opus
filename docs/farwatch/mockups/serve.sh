#!/usr/bin/env bash
# Serve the Farwatch UI mockups for viewing outside the devcontainer.
#
#   ./serve.sh [port]      # default 8173
#
# Binds 0.0.0.0 so a forwarded devcontainer port reaches your browser.
# In VS Code Dev Containers the port is usually auto-forwarded; otherwise
# forward it from the Ports panel (or -p 8173:8173 on the container).
set -euo pipefail

PORT="${1:-8173}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Farwatch mockups → http://localhost:${PORT}/  (forward port ${PORT} from the devcontainer)"
exec python3 -m http.server "${PORT}" --bind 0.0.0.0 --directory "${DIR}"
