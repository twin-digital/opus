#!/usr/bin/env bash
# One-time: activate village-guard in the dev world.
#
# `docker compose cp` (from ../village-guard/deploy.mjs) only puts the pack in the server's
# development_behavior_packs pool — a pack isn't applied until it's listed in
# the world's world_behavior_packs.json. Run this once after the world has
# generated (i.e. after the first `docker compose up`). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

# The world folder is named after LEVEL_NAME; resolve it rather than hardcode.
world=$(docker compose exec -T bedrock sh -c 'ls -1 /data/worlds | head -1' | tr -d '\r')
if [ -z "$world" ]; then
  echo "No world found yet — start the server (docker compose up -d) and let it generate first." >&2
  exit 1
fi

echo "Activating village-guard in world '$world'…"
docker compose cp world_behavior_packs.json "bedrock:/data/worlds/$world/world_behavior_packs.json"
docker compose restart bedrock
echo "Done. The pack is active; use 'pnpm dev' in ../village-guard for the reload loop."
