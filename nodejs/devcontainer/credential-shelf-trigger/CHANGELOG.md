# @twin-digital/credential-shelf-trigger

## 0.2.0

### Minor Changes

- f7b16e9: Make the trigger usable from a phone as an always-on service.

  - Serve a small operator page at `GET /` (and `/index.html`). Enter the shared token once — it's kept in the device's `localStorage` and sent as a Bearer header on each call — then tap Refresh to start a device-code login and get the `user_code` + a tappable approval link, or Check status for session expiry. The token never rides a URL or lands in a log; the page ships no secret and is unauthenticated (the app shell only).
  - When `TRIGGER_TOKEN` is unset the container now stays **disabled and idle** instead of exiting, so a consumer can define it as a plain always-on compose service (no profile, which would break volume sharing under a different project name) and it simply does nothing until a token is set. Still fail-closed: with no token it never serves.

## 0.1.0

### Minor Changes

- 69796c9: Add `@twin-digital/credential-shelf-trigger`: an authenticated, rate-limited HTTP endpoint that fronts the `credential-shelf` refresh primitive over its Unix socket, relaying the device-code `user_code` to the operator. Holds no AWS identity, so a compromise is at most a login-prompt DoS. Published as `ghcr.io/twin-digital/credential-shelf-trigger`.
