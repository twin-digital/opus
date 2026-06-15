# workspace — the dev container image: security hardening + common tooling.
#
# Folds the former base+default split into one image (sole consumer; no reuse value in the
# split). The hardening block below is the load-bearing part — keep it auditable; the tooling
# block is incidental. Build context is the monorepo ROOT (see opus-scripts/bin/artifact.js),
# so the rootfs COPY uses a root-relative path.
FROM mcr.microsoft.com/devcontainers/base:ubuntu

USER root

# ─── security hardening ────────────────────────────────────────────────────────────────────
# Remove sudo (no setuid privilege-escalation path); jq backs the credential shims.
RUN export SUDO_FORCE_REMOVE=yes \
  && apt-get update \
  && apt-get install -y --no-install-recommends jq \
  && apt-get -y purge sudo \
  && apt-get -y autoremove && apt-get clean && rm -rf /var/lib/apt/lists/*

# VS Code host-reaching channel scrub + credential consumer adapters (devcred + git/gh shims).
# The scrub drop-in covers login shells; sourcing it from /etc/bash.bashrc covers interactive
# non-login shells too. Each scrubbed var is opt-out at runtime via SCRUB_<VAR>_ENABLED.
COPY nodejs/devcontainer/workspace/rootfs/ /
RUN printf '\n# Drop VS Code host-reaching channels from interactive shells\n. /etc/profile.d/50-scrub-vscode-git-auth.sh\n' \
    >> /etc/bash.bashrc
# `code --wait` can't launch (the IPC socket is scrubbed) — nano is the in-terminal fallback.
RUN git config --system core.editor nano
RUN chmod 0755 /usr/local/bin/devcred /usr/local/bin/git-credential-devcred \
      /usr/local/bin/gh /usr/local/bin/reap-vscode-sockets
# github.com → devcred (per-org tokens from the shelf, routed by request path); AWS → shelf.
# Inert with no /creds mounted: the helpers resolve to nothing and tools are unauthenticated.
RUN git config --system --unset-all 'credential.https://github.com.helper' 2>/dev/null || true; \
    git config --system --add 'credential.https://github.com.helper' '' \
  && git config --system --add 'credential.https://github.com.helper' 'devcred' \
  && git config --system 'credential.https://github.com.useHttpPath' true
ENV AWS_SHARED_CREDENTIALS_FILE=/creds/aws/credentials

# ─── common tooling ─────────────────────────────────────────────────────────────────────────
# gnupg2 (signing / key handling); purge zsh — the image standardizes on bash.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gnupg2 \
  && apt-get -y purge zsh \
  && apt-get -y autoremove && apt-get clean && rm -rf /var/lib/apt/lists/*

# yq (mikefarah). Override the release with --build-arg YQ_VERSION=<x.y.z>.
ARG YQ_VERSION=4.53.3
RUN arch="$(dpkg --print-architecture)" \
  && wget -q "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_${arch}" \
       -O /usr/local/bin/yq \
  && chmod 0755 /usr/local/bin/yq

# Unprivileged account (consumers can still `USER root` to install). Keep-alive CMD for
# docker-run/compose use; a devcontainer's compose `command:` usually overrides it.
USER vscode
CMD ["sleep", "infinity"]
