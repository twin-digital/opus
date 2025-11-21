# ----------------------------------------------------------------------------------------------------------------------
# Base image with pnpm/corepack
FROM node:22-alpine AS base

ENV DO_NOT_TRACK=1
ENV HUSKY=0
ENV TURBO_TELEMETRY_DISABLED=1

ENV PNPM_HOME=/root/.pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN mkdir -p $PNPM_HOME && corepack enable

# ----------------------------------------------------------------------------------------------------------------------
# PREPARE: install turbo & prune monorepo down to just the current package
FROM base AS prepare

RUN apk update && apk add --no-cache \
  jq

WORKDIR /build

# Install turbo globally using the version declared in package.json (range stripped)
COPY package.json .
RUN set -e; \
    TURBO_VERSION=$(jq -r '.devDependencies.turbo // .dependencies.turbo // ""' package.json); \
    if [ -z "$TURBO_VERSION" ]; then echo "turbo not declared in package.json" >&2; exit 1; fi; \
    echo "Installing turbo@${TURBO_VERSION} globally"; \
    pnpm setup >/dev/null 2>&1 || true; \
    pnpm add -g turbo@${TURBO_VERSION}; \
    turbo --version

# Copy everything for turbo prune to analyze the dependency graph
# This stage is cached and only invalidated when files change
COPY . .

# Generate a partial monorepo with a pruned lockfile for the target workspace
# turbo prune reads package.json files to determine the dependency graph
RUN turbo prune @twin-digital/codex --docker

# After this, we have:
#   /build/out/json  -> pruned package.json + lockfile
#   /build/out/full  -> pruned workspace file tree (codex + deps)

# ----------------------------------------------------------------------------------------------------------------------
# BUILDER: install deps, build, and create deploy snapshot with only prod deps
FROM base AS builder

WORKDIR /build

# 1) Install dependencies (dev + prod) from pruned json/lock
COPY --from=prepare /build/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm/store pnpm install --frozen-lockfile

# 2) Copy the actual source for the pruned workspaces
COPY --from=prepare /build/out/full/ ./

# 3) Build the target workspace
RUN pnpm --filter @twin-digital/codex build

# 4) Create a deployable snapshot with ONLY prod dependencies
#    This will create something like /app/nodejs/apps/codex (depending on your structure)
RUN pnpm deploy --filter @twin-digital/codex --legacy --prod /app

# ----------------------------------------------------------------------------------------------------------------------
# RUNTIME: small image with only prod deps + built bundle
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DO_NOT_TRACK=1
ENV TURBO_TELEMETRY_DISABLED=1

# Don't run production as root
RUN addgroup --system --gid 1001 app \
  && adduser --system --uid 1001 app
USER app

# Copy deployed app (prod deps only)
# pnpm deploy writes the package files directly to /app (bin/, dist/, node_modules/, etc.)
COPY --from=builder --chown=app:app /app ./

# The working directory is already /app from the base stage
# All files (bin/run.js, dist/, node_modules/) are at the root of /app

ENTRYPOINT ["node", "bin/run.js"]
CMD ["start"]
