---
'@twin-digital/opus-scripts': patch
---

`artifact` and `docker-dev` now fail fast with a pointer to #164 when no Docker daemon is reachable (the workspace devcontainer no longer mounts the host Docker socket).
