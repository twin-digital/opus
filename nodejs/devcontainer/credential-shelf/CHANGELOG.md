# @twin-digital/credential-shelf

## 0.1.2

### Patch Changes

- fa03cde: Ship `import-app-private-key` in the credential-shelf image — the one-time tool that imports a GitHub App's RSA key into KMS as a non-extractable signing key (adds `jq`; on PATH as `import-app-private-key`). Salvaged from the retiring `skleinjung/devcontainers` toolkit.

## 0.1.1

### Patch Changes

- 855c711: fix(credential-shelf): drop the base image's `node` user so `credential-vendor` can own uid/gid 1000. `node:24-bookworm-slim` ships a `node` user/group at 1000, so `groupadd -g 1000` collided (exit 4) and the image build failed. Also re-tags `workspace` to rebuild it after a transient `mcr.microsoft.com` base-pull failure (no image change).

## 0.1.0

### Minor Changes

- e4369a0: Add `@twin-digital/credential-shelf`: a consolidated credential vendor sidecar (one image, N vend loops) that reads a unified `vend.yaml` of `aws-sso` / `github-app` providers and vends short-lived, scoped AWS role creds and GitHub App installation tokens onto a read-only `/creds` shelf. Node + AWS CLI (shells to `aws-cli` for STS export and KMS signing; no AWS SDK), published as `ghcr.io/twin-digital/credential-shelf`.

  Also fixes `opus-scripts`' `artifact` to build with the monorepo root as the Docker context (was the package directory), so a package Dockerfile's `turbo prune` can see the full workspace — required by any monorepo turbo-prune image build.
