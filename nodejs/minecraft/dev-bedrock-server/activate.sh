#!/usr/bin/env bash
# Activate every monorepo behavior pack in the dev world.
#
# `docker compose cp` (from a pack's deploy.mjs) only puts a pack in the server's
# development_behavior_packs pool — a pack isn't applied until it's listed in the
# world's world_behavior_packs.json. This regenerates that list from every pack
# in the repo (build-activation.mjs) and copies it in. Run after the world has
# generated (i.e. after the first `docker compose up`); safe to re-run, and re-run
# it whenever you add a pack.
set -euo pipefail
cd "$(dirname "$0")"

# Regenerate world_behavior_packs.json from all packs (any package with a
# pack/manifest.json). Not committed — generated on demand.
node build-activation.mjs

# The world folder is named after LEVEL_NAME; resolve it rather than hardcode.
world=$(docker compose exec -T bedrock sh -c 'ls -1 /data/worlds | head -1' | tr -d '\r')
if [ -z "$world" ]; then
  echo "No world found yet — start the server (docker compose up -d) and let it generate first." >&2
  exit 1
fi

echo "Activating packs in world '$world'…"
docker compose cp world_behavior_packs.json "bedrock:/data/worlds/$world/world_behavior_packs.json"
docker compose restart bedrock
echo "Done. Use 'pnpm dev' in a pack's dir for the reload loop."
