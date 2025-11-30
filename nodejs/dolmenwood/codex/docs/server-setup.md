# Bot Server Setup

## System Setup

### Initial Setup

Update packages, instal qemu-agent

```bash
#!/usr/bin/env /bin/bash

sudo apt-get update
sudo apt-get install qemu-guest-agent
sudo apt-get upgrade
```

### Install Docker

```bash
#!/usr/bin/env /bin/bash

########################################################################################################################
# remove unofficial packages
########################################################################################################################

for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done

########################################################################################################################
# Configure apt
########################################################################################################################

# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" |   sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

########################################################################################################################
# Install docker
########################################################################################################################

sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

########################################################################################################################
# Test installation
########################################################################################################################

sudo systemctl status docker
sudo docker run hello-world
```

### Docker postinstall

```bash
#!/usr/bin/env /bin/bash

sudo usermod -aG docker $USER
newgrp docker
docker run hello-world
```

## App Install

### Create .env

Place the following file in the app directory (e.g. /home/discord):

```env
# /home/discord/.env
DISCORD_APP_ID=your_discord_app_id_here
DISCORD_TOKEN=your_discord_bot_token_here
```

### Compose: App + Watchtower auto-update

This repo ships development compose that builds from source. For running 24x7 and auto-updating when
`ghcr.io/twin-digital/codex:latest` is published, create the following production compose file (example path:
`/home/discord/docker-compose.yml`).

- The `codex` service runs the published image `ghcr.io/twin-digital/codex:latest`
- The `watchtower` service runs `nickfedor/watchtower` and is configured to poll every 120 seconds, redeploying on updates

Example `docker-compose.yml` (placed next to your `.env`):

```yaml
version: '3.9'

services:
  codex:
    image: ghcr.io/twin-digital/codex:latest
    env_file:
      - .env
    working_dir: /app
    restart: unless-stopped
    labels:
      com.centurylinklabs.watchtower.enable: 'true'

  watchtower:
    image: nickfedor/watchtower:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: --interval 120 --label-enable --cleanup
    restart: unless-stopped
```

Notes:

- The `com.centurylinklabs.watchtower.enable` label ensures Watchtower updates only the `codex` container. Without
  `--label-enable`, Watchtower would check and update all containers on the host.
- The Watchtower container requires access to the Docker socket. We mount it read-only for minimal extra privileges.
- Because this image is public, no `docker login` is required. If the image becomes private in future, authenticate on
  the host using `docker login ghcr.io` and a PAT with `read:packages`.

### Deploy commands (one-liners)

Start the services (pull image and run):

```bash
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

View logs and status:

```bash
docker compose -f docker-compose.yml ps
# app logs
docker compose -f docker-compose.yml logs -f codex
# watchtower logs for update failures
docker compose -f docker-compose.yml logs -f watchtower
```

To manually update and restart (if not using Watchtower or to force immediate update):

```bash
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

### Run on boot (systemd)

Create a systemd unit to start the compose on boot. Example unit file at `/etc/systemd/system/codex.service`:

```ini
[Unit]
Description=Codex Docker Compose
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/discord
ExecStart=/usr/bin/docker compose -f /home/discord/docker-compose.yml up -d
ExecStop=/usr/bin/docker compose -f /home/discord/docker-compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start the unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now codex.service
```

### Troubleshooting

- If the container fails to start, check `docker compose -f docker-compose.yml logs -f codex` for errors.
- If Watchtower doesn't update, ensure the `watchtower` container can access the Docker socket and the `codex` container has the correct label.
- If you see permission errors writing to mounted volumes, confirm ownership and permissions match the non-root user used inside the image.

### Final checklist before going live

- Create `/home/discord/.env` from `.env.example` and populate required secrets (this file is `.gitignore`d).
- Place `docker-compose.yml` next to `.env` and run `docker compose -f docker-compose.yml up -d`.
- Confirm logs show the app started and Watchtower is running.
