# @twin-digital/credential-shelf-trigger

The **network-facing trigger** for the [`credential-shelf`](../credential-shelf) sidecar's
remote refresh. It exposes a small **authenticated, rate-limited** HTTP endpoint that, on an
authorized request, drives the sidecar's one refresh primitive over a **Unix socket** and
relays the device-code `user_code` + `verification_uri` back to the operator. The operator
completes approval in a browser (IdP + MFA).

It exists to make an AWS Identity Center session refresh **remotely triggerable** without a
host shell — so you can revive AWS vending while away from the terminal.

Published as `ghcr.io/twin-digital/credential-shelf-trigger`.

## Trust boundary — why this can only DoS, never mint

This container is **deliberately powerless**. By construction:

- **No AWS identity, no `admin-home`, no Docker socket.** It holds nothing that can mint or
  assume a role. Its sole capability is to relay to the sidecar's refresh socket.
- **It only initiates a login; it never completes one.** AWS Identity Center (+MFA) is the
  minter. The sidecar's primitive starts a device authorization and vends only after the
  operator approves — this service just carries the `user_code` to the operator.
- **The primitive takes no arguments.** The sso-session is fixed in the sidecar's baked
  config, so a compromised endpoint cannot redirect the flow to another IdP or widen scope.

So the worst an abused endpoint yields is a **login-prompt DoS** (mitigated by rate-limiting),
not a credential mint.

## Endpoints

- `POST /refresh` — **authenticated + rate-limited.** Triggers a device-code refresh; returns
  `{ prompts: [{ session, user_code, verification_uri, verification_uri_complete? }] }`. Match
  the `user_code` against the AWS approval screen and **approve only a code you just
  initiated** — refuse unsolicited prompts.
- `GET /status` — **authenticated.** Current SSO-session + vended-credential expiry, so you
  know when a refresh is due.
- `GET /healthz` — unauthenticated liveness; carries no secrets.

The `user_code` / verification URL travel to the authenticated operator in the response body
**only**; they are never logged. Every attempt is audit-logged (who/when/outcome) without any
secret material.

## Configure (environment)

| Var                               | Default                              | Meaning                                                                                                                                               |
| --------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRIGGER_TOKEN`                   | — (**required**)                     | Shared bearer secret. The service refuses to start without it (fails closed).                                                                         |
| `TRIGGER_LISTEN`                  | `0.0.0.0:8770`                       | `host:port` to bind inside the container. Restrict reachability with the **consumer's port mapping** — bind it to the LAN, not public, not a tailnet. |
| `TRIGGER_UPSTREAM_SOCKET`         | `/run/credential-shelf/refresh.sock` | The sidecar's refresh socket (a volume shared **only** with the sidecar).                                                                             |
| `TRIGGER_RATE_LIMIT_INTERVAL_SEC` | `30`                                 | Seconds to refill one trigger token.                                                                                                                  |
| `TRIGGER_RATE_LIMIT_BURST`        | `1`                                  | Token-bucket capacity.                                                                                                                                |

Auth is a **shared bearer token** (v1). Passkey/WebAuthn is a possible later upgrade.

## How a consumer fronts it

Run it beside the `credential-shelf` sidecar, sharing one volume for the refresh socket, and
publish its port **to the home LAN only** (not public, not a tailnet). Give it `cap_drop: ALL`
and `no-new-privileges`, and mount **only** the socket volume — no AWS creds, no `admin-home`,
no Docker socket. Set `REFRESH_LISTENER_SOCKET` on the sidecar to the same socket path so it
binds the primitive. See [`credential-shelf` docs/SECURITY.md](../credential-shelf/docs/SECURITY.md).
