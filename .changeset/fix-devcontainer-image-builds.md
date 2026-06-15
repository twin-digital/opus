---
'@twin-digital/credential-shelf': patch
'@twin-digital/workspace': patch
---

fix(credential-shelf): drop the base image's `node` user so `credential-vendor` can own uid/gid 1000. `node:24-bookworm-slim` ships a `node` user/group at 1000, so `groupadd -g 1000` collided (exit 4) and the image build failed. Also re-tags `workspace` to rebuild it after a transient `mcr.microsoft.com` base-pull failure (no image change).
