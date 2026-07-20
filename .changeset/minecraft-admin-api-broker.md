---
'@twin-digital/minecraft-admin-api': minor
---

Add the Minecraft admin API: a local broker that becomes the single owner of the
Bedrock server's screen console and save-hold snapshot protocol, behind a
Unix-socket HTTP API (`/health`, `/server/status`, `/console/command`,
`/snapshot`). Makes console access single-owner so replies can't interleave and
a `save hold` can't be stranded. WIP — Ansible deploy, client wiring, and typed
high-level ops still to come.
