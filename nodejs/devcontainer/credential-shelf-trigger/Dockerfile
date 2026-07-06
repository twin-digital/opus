# credential-shelf-trigger — the network-facing remote-refresh trigger.
#
# Deliberately minimal: Node + the built bundle, and NOTHING else — no AWS CLI, no AWS
# identity, no admin-home, no Docker socket. Its only capability is to relay to the
# credential-shelf sidecar's refresh Unix socket (a shared-volume mount). A compromise of
# this container is at most a login-prompt DoS, never a credential mint.
#
# Build context is the MONOREPO ROOT (see opus-scripts/bin/artifact.js) so `turbo prune` can
# see the full workspace; this Dockerfile lives in the package dir.
# ----------------------------------------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
ENV DO_NOT_TRACK=1
ENV HUSKY=0
ENV TURBO_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/root/.pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN mkdir -p $PNPM_HOME && corepack enable

# ----------------------------------------------------------------------------------------------------------------------
# PREPARE: install turbo (version from root package.json) and prune the workspace to this package
FROM base AS prepare
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY package.json .
RUN set -e; \
    TURBO_VERSION=$(jq -r '.devDependencies.turbo // .dependencies.turbo // ""' package.json); \
    [ -n "$TURBO_VERSION" ] || { echo "turbo not declared in root package.json" >&2; exit 1; }; \
    pnpm setup >/dev/null 2>&1 || true; \
    pnpm add -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune @twin-digital/credential-shelf-trigger --docker

# ----------------------------------------------------------------------------------------------------------------------
# BUILDER: install deps, build, and create a prod-only deploy snapshot
FROM base AS builder
WORKDIR /build
COPY --from=prepare /build/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm/store pnpm install --frozen-lockfile
COPY --from=prepare /build/out/full/ ./
RUN pnpm --filter @twin-digital/credential-shelf-trigger build
RUN pnpm deploy --filter @twin-digital/credential-shelf-trigger --legacy --prod /app

# ----------------------------------------------------------------------------------------------------------------------
# RUNNER: small image with just the built bundle (prod deps only) — no AWS CLI, no secrets
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV DO_NOT_TRACK=1
ENV TURBO_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Unprivileged account at uid/gid 1000 — that uid must match the credential-shelf sidecar's so
# this container can open the 0660 refresh socket on the shared volume. The base image ships a
# `node` user/group at 1000, so drop all pre-made uid >= 1000 users first to free the uid/gid.
RUN getent passwd \
    | awk -F: '($3 >= 1000) && ($1 != "nobody") {print $1}' \
    | xargs -r -n 1 userdel -r \
  && rm -rf /etc/sudoers.d/* \
  && { groupadd --gid 1000 refresh-trigger || true; } \
  && useradd -s /bin/bash -m -u 1000 -g 1000 refresh-trigger

WORKDIR /app
COPY --from=builder --chown=refresh-trigger:refresh-trigger /app ./
RUN chmod 0755 /app/bin/run.js \
  && ln -s /app/bin/run.js /usr/local/bin/credential-shelf-trigger

USER refresh-trigger
ENTRYPOINT ["credential-shelf-trigger"]
