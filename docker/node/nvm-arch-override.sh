#!/bin/bash

# Override nvm_get_arch to use musl suffix for Alpine Linux
# This allows NVM to use pre-compiled musl binaries from unofficial-builds.nodejs.org
# instead of compiling from source

nvm_get_arch() {
  local HOST_ARCH
  HOST_ARCH="$(uname -m)"
  local NVM_ARCH
  case "${HOST_ARCH}" in
    x86_64 | amd64) NVM_ARCH="x64-musl" ;;
    aarch64 | arm64) NVM_ARCH="arm64-musl" ;;
    armv7l) NVM_ARCH="armv7l" ;;
    *) nvm_echo >&2 "Unsupported architecture: ${HOST_ARCH}" && return 1 ;;
  esac
  nvm_echo "${NVM_ARCH}"
}
