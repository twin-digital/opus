---
---

Mint short-lived GitHub App tokens via AWS KMS, and harden the devcontainer secret surface.

- Agents (and the publish workflow) obtain scoped, ~1h GitHub App installation tokens by signing
  the App JWT with an AWS KMS key; the App private key never leaves KMS. In the container the
  gate is the live AWS SSO session; in CI it is GitHub OIDC → a tightly-scoped AWS role.
- `publish.yaml` now mints its token this way (OIDC → KMS) instead of the long-lived
  `CHANGESETS_GITHUB_TOKEN` PAT. Unlike the default `GITHUB_TOKEN`, the App token's pushes
  re-trigger downstream workflows (the release chain). The docker jobs keep the default
  `GITHUB_TOKEN` with read-only `contents`.
- Devcontainer mounts only the commit-signing key (`id_ed25519`/`.pub`), read-only, instead of
  the whole `~/.ssh` — closing the authorized_keys and key-exfil vectors.
- Add `CODEOWNERS` so high-blast-radius paths (workflows, devcontainer, changeset/repo-kit
  config) require an owning reviewer.

No package code is affected, so this carries no version bump.
