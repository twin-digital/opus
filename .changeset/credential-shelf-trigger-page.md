---
'@twin-digital/credential-shelf-trigger': minor
---

Serve a small operator page at `GET /` (and `/index.html`). Enter the shared token once — it's kept in the device's `localStorage` and sent as a Bearer header on each call — then tap Refresh to start a device-code login and get the `user_code` + a tappable approval link, or Check status for session expiry. This makes the trigger usable from a phone via a plain LAN bookmark without putting the token in a URL. The page ships no secret and is unauthenticated (the app shell only).
