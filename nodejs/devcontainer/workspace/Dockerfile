# workspace — the dev container image: security hardening + common tooling.
#
# Folds the former base+default split AND the devcontainer.json `features` (aws-cli, gh,
# node/nvm, python, terraform) into one prebuilt image, so a devcontainer rebuild just pulls
# cached layers instead of re-running feature installs every time.
#
# Layer order is stable→volatile for cache reuse: base apt packages first, then each pinned
# tool in its own layer (bumping one version rebuilds only that layer + below), and the
# occasionally-edited rootfs/credential block LAST so editing a shim never reinstalls a
# toolchain. Build context is the monorepo ROOT (opus-scripts/bin/artifact.js).
#
# Pinned versions are starting points — confirm/bump on first build (override with --build-arg).
FROM mcr.microsoft.com/devcontainers/base:ubuntu

USER root
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ─── system packages (stable) ───────────────────────────────────────────────────────────────
# Hardening: remove sudo (no setuid privilege-escalation path). Plus the base toolchain and
# python (the former `python` feature): one apt layer, one update, lists cleaned in-layer.
RUN export SUDO_FORCE_REMOVE=yes \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
       jq gnupg2 ca-certificates curl wget unzip \
       python3 python3-pip python3-venv python-is-python3 \
  && apt-get -y purge sudo zsh \
  && apt-get -y autoremove && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── pinned binary tools (one layer each; least- to most-frequently-bumped) ───────────────────
# AWS CLI v2 (glibc; arch-mapped). Uses the standard installer (always-valid latest).
RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in amd64) a=x86_64 ;; arm64) a=aarch64 ;; *) echo "unsupported arch: $arch" >&2; exit 1 ;; esac \
  && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${a}.zip" -o /tmp/awscli.zip \
  && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install \
  && rm -rf /tmp/aws /tmp/awscli.zip

# yq (mikefarah).
ARG YQ_VERSION=4.53.3
RUN arch="$(dpkg --print-architecture)" \
  && wget -q "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_${arch}" -O /usr/local/bin/yq \
  && chmod 0755 /usr/local/bin/yq

# Terraform.
ARG TERRAFORM_VERSION=1.10.5
RUN arch="$(dpkg --print-architecture)" \
  && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${arch}.zip" -o /tmp/tf.zip \
  && unzip -q /tmp/tf.zip -d /usr/local/bin && rm -f /tmp/tf.zip && chmod 0755 /usr/local/bin/terraform

# GitHub CLI. Install the real binary to /usr/bin/gh — the base ships a devcred wrapper at
# /usr/local/bin/gh (earlier on PATH) that injects the vended token and execs this one.
ARG GH_VERSION=2.63.2
RUN arch="$(dpkg --print-architecture)" \
  && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz" -o /tmp/gh.tgz \
  && tar -xzf /tmp/gh.tgz -C /tmp \
  && install -m 0755 "/tmp/gh_${GH_VERSION}_linux_${arch}/bin/gh" /usr/bin/gh \
  && rm -rf /tmp/gh.tgz "/tmp/gh_${GH_VERSION}_linux_${arch}"

# node via nvm (kept by choice — the user manages extra versions with nvm). NVM_DIR is shared
# and owned by the unprivileged user so `nvm install <other>` works at runtime; the default
# version's bin is on PATH non-interactively (scripts, postCreate), and nvm.sh is sourced for
# interactive shells. corepack provides the pnpm/yarn shims the monorepo uses.
ENV NVM_DIR=/usr/local/share/nvm
ENV PATH=${NVM_DIR}/current/bin:${PATH}
ARG NVM_VERSION=0.40.1
ARG NODE_VERSION=24
RUN mkdir -p "$NVM_DIR" \
  && curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh" | PROFILE=/dev/null bash \
  && . "$NVM_DIR/nvm.sh" \
  && nvm install "$NODE_VERSION" \
  && nvm alias default "$NODE_VERSION" \
  && ln -s "$NVM_DIR/versions/node/$(nvm version default)" "$NVM_DIR/current" \
  && corepack enable \
  && nvm cache clear \
  && printf '\nexport NVM_DIR=%s\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' "$NVM_DIR" >> /etc/bash.bashrc \
  && chown -R vscode:vscode "$NVM_DIR"

# ─── security: VS Code channel scrub + credential shims (volatile — kept last) ────────────────
# Last so editing a shim or the scrub doesn't invalidate the toolchain layers above.
# The scrub drop-in covers login shells; sourcing it from /etc/bash.bashrc covers interactive
# non-login shells too. Each scrubbed var is opt-out at runtime via SCRUB_<VAR>_ENABLED.
COPY nodejs/devcontainer/workspace/rootfs/ /
RUN printf '\n# Drop VS Code host-reaching channels from interactive shells\n. /etc/profile.d/50-scrub-vscode-git-auth.sh\n' \
      >> /etc/bash.bashrc \
  && git config --system core.editor nano \
  && chmod 0755 /usr/local/bin/devcred /usr/local/bin/git-credential-devcred \
       /usr/local/bin/gh /usr/local/bin/reap-vscode-sockets \
  && git config --system --unset-all 'credential.https://github.com.helper' 2>/dev/null || true
RUN git config --system --add 'credential.https://github.com.helper' '' \
  && git config --system --add 'credential.https://github.com.helper' 'devcred' \
  && git config --system 'credential.https://github.com.useHttpPath' true
ENV AWS_SHARED_CREDENTIALS_FILE=/creds/aws/credentials

# Unprivileged account (consumers can still `USER root` to install). Keep-alive CMD for
# docker-run/compose use; a devcontainer's compose `command:` usually overrides it.
USER vscode
CMD ["sleep", "infinity"]
