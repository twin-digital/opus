---
'@twin-digital/credential-shelf': minor
---

Add an optional remote-refresh listener. When `REFRESH_LISTENER_SOCKET` is set, `start` binds a Unix-socket primitive (`POST /refresh`, `GET /status`) that lets a network-facing peer initiate the device-code SSO login remotely — single-flight, no request arguments, and only ever _initiates_ the login (AWS Identity Center stays the minter). Front it with `credential-shelf-trigger`.
