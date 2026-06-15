# @twin-digital/workspace

The dev container image — **security hardening + common tooling** in one image (the former
`base` + `default`, folded together). Most devcontainers run this directly or build `FROM`
it. Published as `ghcr.io/twin-digital/workspace`.

A Dockerfile-only package: no source, no build — the monorepo publish workflow builds and
pushes the image (`pnpm artifact` → a plain `docker build`).

## What it provides

**Security hardening** (the load-bearing part):

- **No `sudo`** — purged, so there's no setuid privilege-escalation path.
- **VS Code host-reaching-channel scrub** — `rootfs/etc/profile.d/50-scrub-vscode-git-auth.sh`,
  sourced from `/etc/bash.bashrc` so interactive non-login shells get it too. Each scrubbed
  var is opt-out at runtime via `SCRUB_<VAR>_ENABLED`. git's editor defaults to `nano` (the
  `code` IPC socket is scrubbed).
- **Credential consumer adapters** — `devcred` + the git/gh shims (in `rootfs/usr/local/bin`).
  `github.com`'s credential helper is wired to `devcred` (per-org tokens from the `/creds`
  shelf, routed by request path); `AWS_SHARED_CREDENTIALS_FILE` points at the shelf. All are
  **inert** with no `/creds` mounted — tools are simply unauthenticated.

**Common tooling:** `gnupg2`, `yq` (mikefarah; `--build-arg YQ_VERSION` to override).

Runs as the unprivileged `vscode` user; keep-alive `CMD ["sleep","infinity"]` (a devcontainer
compose `command:` usually overrides it).

## Pairing with the shelf

Pair it with [`credential-shelf`](../credential-shelf): that sidecar vends onto the read-only
`/creds` shelf, and this image's shims consume it — `git push/pull` over HTTPS and `aws`/`gh`
"just work" once the sidecar is vending, with nothing in the workspace able to mint or widen
a credential.
