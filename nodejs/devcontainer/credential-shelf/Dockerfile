# credential-shelf — consolidated credential vendor sidecar.
#
# Build context is the MONOREPO ROOT (see opus-scripts/bin/artifact.js) so `turbo prune` can
# see the full workspace; this Dockerfile lives in the package dir. Debian (not Alpine) base
# because the runtime shells out to the official AWS CLI v2, which is glibc-only.
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
RUN turbo prune @twin-digital/credential-shelf --docker

# ----------------------------------------------------------------------------------------------------------------------
# BUILDER: install deps, build, and create a prod-only deploy snapshot
FROM base AS builder
WORKDIR /build
COPY --from=prepare /build/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm/store pnpm install --frozen-lockfile
COPY --from=prepare /build/out/full/ ./
RUN pnpm --filter @twin-digital/credential-shelf build
RUN pnpm deploy --filter @twin-digital/credential-shelf --legacy --prod /app

# ----------------------------------------------------------------------------------------------------------------------
# RUNNER: small image with AWS CLI v2 + the built bundle (prod deps only)
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV DO_NOT_TRACK=1
ENV TURBO_TELEMETRY_DISABLED=1

# AWS CLI v2 (glibc-only; the vend loops shell to it for STS export + KMS sign), openssl
# (the one-time GitHub App key import), and ca-certificates for TLS.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl openssl unzip \
  && arch="$(dpkg --print-architecture)" \
  && case "$arch" in amd64) a=x86_64 ;; arm64) a=aarch64 ;; *) echo "unsupported arch: $arch" >&2; exit 1 ;; esac \
  && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${a}.zip" -o /tmp/awscli.zip \
  && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install \
  && apt-get purge -y --auto-remove curl unzip \
  && rm -rf /tmp/aws /tmp/awscli.zip /var/lib/apt/lists/*

# Unprivileged vendor account at uid/gid 1000 — that uid (not the name) is the contract: it
# must match the consumer's uid so the 0600 shelf files are readable on the read-only mount.
RUN groupadd -g 1000 credential-vendor \
  && useradd -m -u 1000 -g 1000 -s /bin/bash credential-vendor \
  && mkdir -p /creds && chown credential-vendor /creds

# Baked default config (idle). Override in a derived image, NOT a /workspace bind-mount.
COPY nodejs/devcontainer/credential-shelf/vend.yaml /etc/credential-shelf/vend.yaml

WORKDIR /app
COPY --from=builder --chown=credential-vendor:credential-vendor /app ./
RUN chmod 0755 /app/bin/run.js && ln -s /app/bin/run.js /usr/local/bin/credential-shelf

USER credential-vendor
# `credential-shelf start` (default) supervises the vend loops; `refresh` does the SSO login.
ENTRYPOINT ["credential-shelf"]
CMD ["start"]
