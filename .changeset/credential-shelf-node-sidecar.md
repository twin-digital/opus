---
'@twin-digital/credential-shelf': minor
'@twin-digital/opus-scripts': patch
---

Add `@twin-digital/credential-shelf`: a consolidated credential vendor sidecar (one image, N vend loops) that reads a unified `vend.yaml` of `aws-sso` / `github-app` providers and vends short-lived, scoped AWS role creds and GitHub App installation tokens onto a read-only `/creds` shelf. Node + AWS CLI (shells to `aws-cli` for STS export and KMS signing; no AWS SDK), published as `ghcr.io/twin-digital/credential-shelf`.

Also fixes `opus-scripts`' `artifact` to build with the monorepo root as the Docker context (was the package directory), so a package Dockerfile's `turbo prune` can see the full workspace — required by any monorepo turbo-prune image build.
