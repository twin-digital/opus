FROM alpine:3.22

# Build arguments
ARG NVM_VERSION=0.40.3
ARG NODE_PREINSTALL_VERSIONS=lts/jod

# Needed to get correct binaries on alpine
# https://gist.github.com/ralexandr/8d991531360123dff9b9f72faaa0f0de
ENV NVM_NODEJS_ORG_MIRROR=https://unofficial-builds.nodejs.org/download/release

# Install base dependencies
RUN apk add --no-cache \
    bash \
    curl \
    git \
    jq \
    ca-certificates \
    # dependencies for using precompiled nodejs binaries on alpine
    libstdc++ \
    coreutils \
    # Dependencies for building native modules
    python3 \
    make \
    g++ \
    linux-headers

# Create non-root user
RUN addgroup -g 1000 node && \
    adduser -D -u 1000 -G node node

# Switch to node user for NVM installation
USER node
WORKDIR /home/node

# Install NVM
RUN curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh" | bash

# Set up environment for NVM
ENV NVM_DIR=/home/node/.nvm

# Copy NVM architecture override for Alpine (musl) builds
RUN mkdir -p ~/.nvm/custom
COPY --chown=node:node nvm-arch-override.sh /home/node/.nvm/custom/arch-override.sh

# Preinstall Node versions if specified
RUN if [ -n "$NODE_PREINSTALL_VERSIONS" ]; then \
        bash -c ". $NVM_DIR/nvm.sh && \
        . ~/.nvm/custom/arch-override.sh && \
        IFS=',' read -ra VERSIONS <<< \"$NODE_PREINSTALL_VERSIONS\" && \
        for VERSION in \"\${VERSIONS[@]}\"; do \
            echo \"Preinstalling Node.js version: \$VERSION\" && \
            nvm install \"\$VERSION\"; \
        done"; \
    fi

# Set up bash profile to auto-load NVM for interactive shells and RUN commands
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc && \
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc && \
    echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc

# Set default SHELL to bash for better NVM support in derived images
SHELL ["/bin/bash", "-l", "-c"]

# Copy and set up entrypoint script that loads NVM
COPY --chown=node:node entrypoint.sh /home/node/entrypoint.sh
RUN chmod +x /home/node/entrypoint.sh

# Set entrypoint to load NVM before executing any command
ENTRYPOINT ["/home/node/entrypoint.sh"]
CMD ["node", "--version"]
