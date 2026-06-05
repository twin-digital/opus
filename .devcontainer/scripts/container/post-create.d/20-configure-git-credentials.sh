#!/usr/bin/env bash
set -euo pipefail

# Make HTTPS + the KMS-minted GitHub App token the default git transport+credential for the opus
# checkout — for everyone using it: you at the terminal and any agent. No SSH keys, no stored
# `gh` login, no GH_TOKEN in the environment; the `gh` wrapper mints on demand (gated by the
# ambient AWS session) and `gh auth git-credential` hands that token to git.
#
# Repo-local (not --global): the App installation token is scoped to twin-digital/opus, so it
# must not be offered for your other GitHub repos. Worktrees share this config, so they inherit
# it too. Idempotent — safe to re-run on every container (re)create.

REPO=/workspace/opus
[ -d "$REPO/.git" ] || exit 0

# Resolve any git@github.com: remote in this repo to HTTPS, so the token (an HTTPS credential) is
# what authenticates — SSH to GitHub is intentionally unavailable here.
git -C "$REPO" config --local --unset-all url."https://github.com/".insteadOf 2>/dev/null || true
git -C "$REPO" config --local --add url."https://github.com/".insteadOf "git@github.com:"

# Also rewrite the STORED origin URL to HTTPS (not just via insteadOf). insteadOf only covers the
# git CLI; a tool that reads the raw remote URL and bypasses it (libgit2-based, or an editor probing
# the remote at startup) would otherwise fall back to SSH — prompting the forwarded yubikey/agent.
raw="$(git -C "$REPO" config --get remote.origin.url 2>/dev/null || true)"
case "$raw" in
  git@github.com:*)       git -C "$REPO" remote set-url origin "https://github.com/${raw#git@github.com:}" ;;
  ssh://git@github.com/*) git -C "$REPO" remote set-url origin "https://github.com/${raw#ssh://git@github.com/}" ;;
esac

# Hand credentials to git via gh's own helper, routed through our minting wrapper (/usr/local/bin/gh).
# The leading empty value resets inherited helpers (e.g. the VS Code credential proxy) so the App
# token is authoritative for this repo rather than whatever the host happens to offer.
git -C "$REPO" config --local --unset-all credential.helper 2>/dev/null || true
git -C "$REPO" config --local --add credential.helper ""
git -C "$REPO" config --local --add credential.helper "!/usr/local/bin/gh auth git-credential"
