# @twin-digital/credential-shelf-trigger

## 0.1.0

### Minor Changes

- 69796c9: Add `@twin-digital/credential-shelf-trigger`: an authenticated, rate-limited HTTP endpoint that fronts the `credential-shelf` refresh primitive over its Unix socket, relaying the device-code `user_code` to the operator. Holds no AWS identity, so a compromise is at most a login-prompt DoS. Published as `ghcr.io/twin-digital/credential-shelf-trigger`.
