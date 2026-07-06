# @twin-digital/workspace

## 0.1.1

### Patch Changes

- 855c711: fix(credential-shelf): drop the base image's `node` user so `credential-vendor` can own uid/gid 1000. `node:24-bookworm-slim` ships a `node` user/group at 1000, so `groupadd -g 1000` collided (exit 4) and the image build failed. Also re-tags `workspace` to rebuild it after a transient `mcr.microsoft.com` base-pull failure (no image change).

## 0.1.0

### Minor Changes

- e4369a0: Add `@twin-digital/workspace`: the dev container image, folding the former `base` + `default` split into one image — security hardening (no sudo, the VS Code host-reaching-channel scrub, the `devcred`/git/gh credential shims, AWS pointed at the shelf) plus common tooling (`gnupg2`, `yq`). A Dockerfile-only package published as `ghcr.io/twin-digital/workspace` via the monorepo publish workflow.
