# Godot 4.7.2 with a virtual display and software OpenGL, and Node.js for the relay.
FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip xvfb xauth \
    libgl1 libgl1-mesa-dri libglx-mesa0 libegl1 libglu1-mesa \
    libx11-6 libxcursor1 libxext6 libxi6 libxinerama1 libxrandr2 libxrender1 libxkbcommon0 \
    libfontconfig1 libasound2 \
  && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
ARG GODOT_VERSION=4.7.2
ARG GODOT_SHA512_X86_64=9aa00f7a605200940bce3027a567b782f49bd8e940dd06ae9e987bd65aee1b1467edd56ed84fcdcbdd44354bf613bdbb4e5d2913e925850368e150c59ed54c65
ARG GODOT_SHA512_ARM64=dd59918da086bd49bde2f5450b5e567ff8650cbde9abbd7b8f4ca1197ff8c609baa38834666d032deafb47099078d7822279e2a0e06e5665745468f26533e7e2

RUN set -eu; \
  case "${TARGETARCH:-amd64}" in \
    amd64) arch=x86_64; sum="${GODOT_SHA512_X86_64}" ;; \
    arm64) arch=arm64; sum="${GODOT_SHA512_ARM64}" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  name="Godot_v${GODOT_VERSION}-stable_linux.${arch}"; \
  curl -fsSL -o "/tmp/${name}.zip" "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/${name}.zip"; \
  echo "${sum}  /tmp/${name}.zip" | sha512sum -c -; \
  unzip -q "/tmp/${name}.zip" -d /tmp/godot; \
  install -m 0755 "/tmp/godot/${name}" /usr/local/bin/godot; \
  rm -rf /tmp/godot "/tmp/${name}.zip"

COPY relay.mjs /srv/relay.mjs

WORKDIR /srv
