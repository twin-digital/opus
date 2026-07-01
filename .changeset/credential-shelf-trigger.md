---
'@twin-digital/credential-shelf-trigger': minor
---

Add `@twin-digital/credential-shelf-trigger`: the network-facing trigger for the credential-shelf remote refresh. An authenticated (shared bearer token), rate-limited HTTP endpoint that relays to the sidecar's device-code refresh primitive over a Unix socket and returns the `user_code` + `verification_uri` to the operator; `GET /status` surfaces session/credential expiry and `GET /healthz` is an unauthenticated liveness probe. Deliberately minimal — no AWS identity, no `admin-home`, no Docker socket — so a compromise is at most a login-prompt DoS, never a credential mint. Every attempt is audit-logged without secret material. Published as `ghcr.io/twin-digital/credential-shelf-trigger`.
