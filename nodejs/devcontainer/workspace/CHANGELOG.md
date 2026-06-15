# @twin-digital/workspace

## 0.1.0

### Minor Changes

- e4369a0: Add `@twin-digital/workspace`: the dev container image, folding the former `base` + `default` split into one image — security hardening (no sudo, the VS Code host-reaching-channel scrub, the `devcred`/git/gh credential shims, AWS pointed at the shelf) plus common tooling (`gnupg2`, `yq`). A Dockerfile-only package published as `ghcr.io/twin-digital/workspace` via the monorepo publish workflow.
