---
'@twin-digital/credential-shelf': minor
---

Add an optional remote-refresh listener. When `REFRESH_LISTENER_SOCKET` is set, `start` binds one narrow inbound handler on a Unix socket — the sidecar's only inbound surface — that a network-facing peer drives to _initiate_ the existing device-code SSO login remotely: `POST /refresh` starts a device authorization for the baked session(s), returns the `user_code` + `verification_uri`, then background-polls and vends on operator approval; `GET /status` reports SSO-session and vended-credential expiry. The primitive takes no request arguments (the session comes from the sidecar's own config, never the caller), is single-flight, and only initiates — AWS Identity Center (+MFA) stays the minter — so whoever reaches the socket gets at most a login-prompt DoS, never a credential mint. Front it with the separate, minimal `credential-shelf-trigger` container.
