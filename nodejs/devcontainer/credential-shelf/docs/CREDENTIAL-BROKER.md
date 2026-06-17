# Credential vending via a broker socket

> **Status:** target design — **not** the shipping baseline. Today's `credential-shelf` is
> the read-only **file shelf** ([SECURITY.md §10](./SECURITY.md#10-layer-3--credential-vending-the-shelf),
> [SECRETS.md](./SECRETS.md)): it writes the `vend.yaml`-configured credentials to `/creds`,
> identical for every consumer that mounts it. This document describes the **broker** variant —
> the same `credential-shelf` sidecar exposing a per-consumer socket and minting on demand
> instead of writing files.

## Why a broker (vs the file shelf)

The file shelf is simple and is what ships, but:

- **At-rest exposure** — shelf files under `/creds` are readable by any process in a consumer
  that mounts them, for the credential's whole lifetime.
- **No usage audit** — a file read is invisible; issuance can't be attributed or rate-limited.
- **Coarse scope/TTL** — every consumer that mounts the shelf gets the same credentials; there's
  no per-request scoping or shorter TTL.

The broker addresses all three: a consumer asks for a credential **by name** over a socket, the
sidecar mints it **on demand** (nothing at rest) and can **scope, time-box, and audit per request**.

## Per-consumer sockets

The sidecar exposes **one socket per consumer**, and the socket is the policy boundary — each is
mounted into exactly one consumer container. Today there is a single consumer, the workspace:

- `/creds/workspace.sock` → the workspace's grants

A consumer asks by name; what the name resolves to (which repos/perms/role, what TTL) is decided
**in the sidecar**, never by the caller, so a consumer can't widen its own grant. Identity is
established by _which socket you can reach_ (mount topology, set by compose), so consumers can
share a uid — the broker does not rely on `SO_PEERCRED` (whose pid is unreliable across namespaces).

This generalizes: if a second consumer is ever added (a CI runner, or a separate agent container),
it gets its own socket and its own — possibly narrower — grant table, drawn on the same upstream
authority.

## Config

The broker grant tables are **baked into the sidecar image** (a reviewed rebuild), like `vend.yaml`
today — a per-consumer extension of the current `providers`/`grants` shape, adding a TTL (and
optional audit) per grant:

```yaml
consumers:
  workspace:
    socket: /creds/workspace.sock
    providers:
      - kind: aws-sso
        options: { start_url: https://d-xxxxxxxxxx.awsapps.com/start/ }
        grants:
          - { account_id: '084828590319', role: developer-ai-agent, ttl: 1h }
      - kind: github-app
        options:
          app_id: '3967552'
          kms_key_id: alias/github-app-signer
          signer: { account_id: '253490790167', role: developer-tool-user }
        grants:
          - {
              name: myorg,
              installation_id: '139694269',
              repos: [opus],
              perms: { contents: read },
              ttl: 15m,
              audit: true,
            }
```

It reuses today's `providers`/`grants` schema, so migrating from the file shelf is adding a
`consumers:` wrapper + `ttl`/`audit` — not a new format. Add more `consumers` entries as more
consumers appear; each gets its own socket and grant table.

## Properties

- **Per-consumer scope** — each consumer's own grants, drawn on the same upstream authority.
- **Nothing at rest** — minted on demand, never written to a consumer-readable file.
- **Per-request audit** — every issuance is attributable (the `audit: true` above).
- **No signing capability or upstream authority in any consumer** — it can only request what its
  grant table allows.
- **Accepted residual (unchanged from the shelf):** a consumer fully controls the token it's
  _granted_ (use + network exfil). The broker controls _acquisition_ and _audit_, not use — pair
  with an egress allowlist to blunt exfiltration.

## Wire protocol

How a consumer fetches over the socket — the `GET <name>` request, the response payload, transport
auto-detection (unix socket / tcp / file shelf / env / none), and the reserved `SIGN` verb — is
specified in [SECRETS.md](./SECRETS.md). The broker is simply the _socket_ transport of that
contract with per-consumer grant tables behind it; the file shelf is the _file_ transport of the
same contract.
