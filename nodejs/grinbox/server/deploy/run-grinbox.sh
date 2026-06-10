#!/bin/sh
# Grinbox Daemon launch wrapper.
#
# Bridges the vTPM-sealed secret bundle into the environment the app reads.
# grinbox.service declares `LoadCredentialEncrypted=grinbox-bundle:...`, so
# systemd unseals the bundle (via the guest vTPM) into
# $CREDENTIALS_DIRECTORY/grinbox-bundle — a unit-private, non-swappable ramfs
# file that is torn down when the unit stops. We source it so the
# deployer-managed secrets (GRINBOX_TOKEN_ENC_KEY, GRINBOX_OAUTH_CLIENT_SECRET,
# AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, …) enter the Daemon's environment
# without ever being written to the guest's own disk.
#
# The Daemon's config contract is unchanged: it reads everything from
# process.env (packages/server/src/config.ts). The bundle is a plain
# `KEY=VALUE`-per-line env file, produced and sealed at provision time by the
# grinbox Ansible role; see docs/decisions/grinbox-secret-delivery.md §5.1.
#
# Installed to /opt/grinbox/bin/run-grinbox.sh (mode 0755) by that role.
set -eu

bundle="${CREDENTIALS_DIRECTORY:?CREDENTIALS_DIRECTORY unset — the unit must set LoadCredentialEncrypted=}/grinbox-bundle"
if [ ! -r "$bundle" ]; then
  echo "grinbox: sealed bundle not readable at $bundle (vTPM unseal failed?)" >&2
  exit 1
fi

# Export every KEY=VALUE from the unsealed bundle, then hand off to the Daemon.
set -a
. "$bundle"
set +a

exec /usr/bin/node /opt/grinbox/packages/server/dist/main.js
