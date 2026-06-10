# Grinbox Gmail OAuth flow

How Grinbox obtains and maintains the Google credentials it
needs to read and write a User's Gmail Account. Vocabulary is in
[glossary.md](glossary.md); the credential storage schema is in
[data-model.md](data-model.md) (`credentials`, `accounts`); the
UI entry point is in [ui-design.md](ui-design.md) (Accounts +
OAuth onboarding). This is the doc those two refer to as the
"OAuth deep-dive."

This concerns **backend-account authorization** — proving to
Google that Grinbox may act on a mailbox. It is unrelated to
**end-user login**, which Grinbox does not have at MVP (the UI is
unauthenticated and lab-internal). Don't conflate the two: the
"OAuth" in [architecture.md](architecture.md)'s out-of-scope list
is end-user login OAuth; the OAuth in _this_ document is Gmail API
authorization and is in scope for M1.

---

## The constraint that shapes everything

Grinbox runs as a long-lived Daemon on a lab VM (private IP, no
TLS, trusts its deployment network). The User adds an Account by
clicking **Add Account** in the web UI. That means a browser must
complete a Google consent flow and the resulting authorization
code must reach the Daemon.

Google restricts OAuth redirect URIs for a Web application client
to either:

- `https://<host>/...` — any host, but TLS is mandatory; or
- `http://localhost` / `http://127.0.0.1` — the loopback
  exception, plaintext allowed.

A plaintext private-IP URL — `http://10.111.1.x:PORT/callback` —
is **rejected at client-registration time**. So the Daemon cannot
simply register its own internal address as the redirect target.

The reconciling fact: in the authorization-code flow the redirect
is a **browser-issued 302**. After consent, Google returns a
redirect _to the browser_; the browser then navigates to the
redirect URI. Google's servers never call the redirect URI
directly. Therefore the callback only has to be reachable **from
the operator's browser**, not from the public internet — and the
public surface can be reduced to exactly one path.

---

## Network model: a one-path public surface

The Daemon's UI and REST API stay internal-only and
unauthenticated, exactly as [architecture.md](architecture.md)
describes. The single exception is the OAuth callback.

```
operator browser ──┬─ internal: http://<daemon-ip>:PORT/  (SPA + API, no auth)
                   │
                   └─ TLS:      https://grinbox.pegasuspad.com/oauth/callback
                                     │  (reverse proxy @ 10.111.1.5, LE cert)
                                     │  proxies ONLY /oauth/callback
                                     ▼
                                daemon :PORT  (same process)
```

The reverse proxy terminates TLS for `grinbox.pegasuspad.com` and
forwards **only** `/oauth/callback` to the Daemon; every other
path on that hostname returns 404 at the proxy. The SPA and the
rest of the API are never served over the public hostname — they
are reached at the Daemon's internal address. This is the
security boundary: the publicly-routable surface is one
state-validated endpoint, not the application.

The registered redirect URI is
`https://grinbox.pegasuspad.com/oauth/callback`.

### What the application requires vs. what deployment chooses

The application's only requirement is:

> The registered `https://` redirect URI routes to the Daemon's
> `/oauth/callback`, and that URL is reachable from the operator's
> browser during onboarding.

How that hostname is made reachable-with-TLS is a deployment
decision with two shapes, both satisfying the above:

- **Public DNS + proxy path-allowlist.** `grinbox.pegasuspad.com`
  resolves publicly to the proxy; the proxy exposes only
  `/oauth/callback`. Fits the lab's current cert method (certbot
  `standalone` / HTTP-01, which needs public :80 reachability at
  issuance). The callback path is internet-reachable but is the
  sole exposed surface and rejects any request without a valid
  pending `state` (below).
- **Split-horizon / internal DNS + DNS-01 cert.** The hostname
  resolves only on the LAN; the callback is never publicly
  reachable. Tighter, but requires switching that one cert to a
  DNS-01 issuance (not the lab's current `standalone` default).
  Viable because — per the constraint section — the callback only
  needs browser reachability, and onboarding happens from the LAN.

The Daemon behaves identically either way. The choice belongs in
the deployment's reverse-proxy and DNS configuration, not in
application code.

---

## OAuth client and consent screen

One Google Cloud project, one **Web application** OAuth client,
shared across every Account a User adds. Per-Account grants differ
(each mailbox consents separately); the client identity does not.

| Setting           | Value                                           | Why                                                                                               |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Client type       | Web application                                 | Server-side code exchange with a confidential `client_secret`; registers an `https` redirect URI. |
| Redirect URI      | `https://grinbox.pegasuspad.com/oauth/callback` | The one-path public surface above.                                                                |
| Publishing status | **Production** (unverified)                     | See below — this is not optional.                                                                 |
| Scopes            | `gmail.modify` + `gmail.send`                   | See below.                                                                                        |

### Publishing status must be Production

A consent screen left in **Testing** status issues refresh tokens
that **expire after 7 days** for sensitive/restricted scopes — a
polling Daemon would lose every Account weekly. Moving the consent
screen to **Production** yields durable refresh tokens (they
survive until explicitly revoked or ~6 months of disuse, the
behavior the [implementation plan](implementation-plan.md) assumes).

Production status for restricted scopes normally triggers Google
verification (a CASA security assessment). That is avoided by
staying **unverified** under the 100-user cap: a single-User
personal install clicks through a one-time "Google hasn't verified
this app" warning at first consent and proceeds. The durable-token
behavior does not depend on verification; only removing the
warning and exceeding 100 users does.

### Scopes: `gmail.modify` + `gmail.send`, requested upfront

- `gmail.modify` covers reading Messages and applying Categories
  (`gmail_api.fetch_metadata`, `list_messages`, `apply_label`).
- `gmail.send` covers Digest delivery
  (`gmail_api.send_message`). **`gmail.modify` does not grant
  send** — sending is a separate scope.

Both are requested at first consent even though `send` is unused
until M5 (Digest delivery). Requesting the full set upfront means
no Account has to re-consent when M5 ships; the alternative
(incremental authorization at M5) forces a re-auth pass across
every configured Account for no lasting benefit on a single-User
install.

### Client credentials are deployment config, not DB state

`client_id` and `client_secret` identify the _application_ and are
provided to the Daemon as deployment configuration (environment).
They are **not** stored in the `credentials` table — that table
holds per-Account tokens (`kind=gmail_oauth`). The `client_secret`
never reaches the browser and never appears in logs.

---

## The flow (pop-up, authorization code + PKCE)

The UI uses a **pop-up**: the consent screen opens in a new
window, the callback posts its result back to the opener, and the
main UI never loses its state.

```
Internal SPA            Daemon (internal API + callback)        Google
─────────────           ────────────────────────────────       ──────
click "Add Account"
  │ POST /oauth/start ─────────▶ generate state (random,
  │                              single-use, short TTL) + PKCE
  │                              verifier/challenge; persist
  │                              pending-auth {state → verifier,
  │                              created_at}; build consent URL
  │ ◀──────────────── consent URL (state, PKCE challenge,
  │                   access_type=offline, prompt=consent,
  │                   scope=modify+send)
  │
  │ window.open(consent URL) ───────────────────────────────────▶ consent
  │                                                  (one-time unverified
  │                                                   warning, first time)
  │                                            ◀── 302 to redirect URI ──┘
  │                                            (browser navigates the popup)
  │                            ┌── GET /oauth/callback?code&state ──┘
  │                            ▼  (via proxy, TLS)
  │                       validate+consume state; exchange
  │                       code + PKCE verifier + client_secret
  │                       ─────────────────────────────────────▶ token endpoint
  │                       ◀── refresh_token, access_token, expiry ┘
  │                       assert refresh_token present;
  │                       fetch Gmail profile (email);
  │                       upsert accounts row; encrypt +
  │                       INSERT credentials (kind=gmail_oauth,
  │                       account_id set); change_log row
  │                       ◀── tiny HTML page ──┐
  │ ◀── postMessage({ok, account_id}) ─────────┘ (popup → opener,
  │     (SPA checks event.origin)                 then popup closes)
  │
  refetch accounts; success toast
```

Notes:

- **`access_type=offline` + `prompt=consent`** are mandatory.
  Without `prompt=consent`, a User who has already granted the
  client receives only an access token on re-auth — no refresh
  token — which is useless for a Daemon. The callback asserts a
  refresh token is present and surfaces a retry instruction if
  not.
- **PKCE** is used even though this is a confidential client with
  a `client_secret`. It is cheap defense-in-depth against
  interception of the code during the popup redirect.
- **`state`** is a server-generated, single-use, short-TTL token.
  It is the CSRF defense and the correlation key between
  `/oauth/start` (internal) and `/oauth/callback` (public). A
  callback request bearing no `state`, an unknown `state`, or an
  already-consumed `state` is rejected. Because flows can only be
  _initiated_ from the internal `/oauth/start`, the public callback
  cannot be driven by an outsider.
- **Cross-origin postMessage** is expected: the opener is the
  internal origin (`http://<daemon-ip>:PORT`), the popup is the
  public origin (`https://grinbox.pegasuspad.com`). The popup
  posts with an explicit `targetOrigin` (the internal origin); the
  SPA verifies `event.origin` is the public callback origin before
  trusting the message.

---

## Token storage and lifecycle

A successful flow writes one `credentials` row
(`kind=gmail_oauth`, `account_id` set). The decrypted payload is
`{ refresh_token, access_token, access_token_expires_at, scopes }`
(per [data-model.md](data-model.md)).

### Encryption at rest

`data_enc` is an encrypted BLOB. The Daemon treats encryption as
an opaque `encrypt(bytes) / decrypt(bytes)` seam over a
**token-encryption key** it receives at startup. The application
neither generates nor persists that key; it only asks for the two
properties that make at-rest encryption meaningful on a
single-node deployment:

- the key is **excluded from any backup** of the State DB — the
  realistic exfiltration path for a single node is the offsite
  backup of the SQLite file, and encryption only defends the case
  where the DB is separated from its key; and
- the key is **bound to the host** as tightly as the platform
  allows, so a copied disk image or a restored backup does not by
  itself yield a usable key.

How the key is custodied and delivered is a deployment concern —
the same mechanism also delivers the other **deployer-managed**
secrets (the OAuth `client_secret` and the Bedrock credential).
The **runtime-managed** secrets — the Gmail tokens and the Pushover
keys — are not delivered that way: they live in the State DB
encrypted under this token-encryption key. The custody design and
the deployer-managed/runtime-managed split are recorded in
[`docs/decisions/grinbox-secret-delivery.md`](../../../docs/decisions/grinbox-secret-delivery.md).

Note the ceiling this does **not** claim: a live, compromised
Daemon process necessarily holds the decrypted key to do its job,
so at-rest encryption defends stolen backups and disk images, not
live root on the machine running the Daemon. That residual risk is
accepted for a single-node lab.

Tokens are never logged, and `change_log` deliberately excludes
the blob (see data-model: a `change_log` row carrying `data_enc`
would be opaque and would re-leak encrypted material into the
audit trail).

### Refresh

Access tokens are short-lived; the refresh token is the durable
secret. Before any Gmail Resource operation (the poll loop is the
common path), if `access_token_expires_at` is within a small skew
(e.g. 5 minutes), the Daemon refreshes against the token endpoint
using the refresh token, then persists the new `access_token` and
`access_token_expires_at` back to the row, bumps `updated_at`, and
writes a `change_log` row with `actor_user_id=NULL` and
`action='updated'` (the before/after reflect `updated_at` moving
and nothing else — per data-model). The `googleapis` client
refreshes lazily; the Daemon's job is to **persist** the refreshed
token so a restart doesn't start cold.

**If the refresh response carries a new `refresh_token`, persist
it too.** Google does not rotate the refresh token on every
refresh for a web-application client, but it can return a
replacement (e.g. after a re-grant, or if rotation is enabled on
the client). The refresh path must overwrite the stored
`refresh_token` whenever one is present in the response — silently
dropping it would leave the Daemon holding a token Google has
superseded, which fails at the next refresh as `invalid_grant`.
Because the token lives in `data_enc`, replacing it is still just
the encrypted blob changing, so the `change_log` row remains a
metadata-only `updated_at` bump.

### Revocation / expiry — `invalid_grant`

A refresh that returns `invalid_grant` means the grant is gone:
the User revoked access, the password changed, or the token
lapsed past ~6 months of disuse. The Daemon does **not** crash or
let one dead Account stall the others. It:

1. Marks the Account as needing re-auth (an Account status).
2. Stops polling that Account.
3. Surfaces the condition in the Activity Log and on the Account
   detail page, where the **Re-auth** affordance lives.

### Detecting and revoking misuse

Out-of-band visibility into a consumer Gmail account is limited, so
the load-bearing response to a suspected compromise is **fast
revocation, not detection.** An operator-initiated revoke is a
first-class capability: it POSTs the token to Google's revoke
endpoint (`https://oauth2.googleapis.com/revoke`), soft-deletes the
credential, and drops the Account into the same needs-re-auth state
as `invalid_grant`. This is the control that bounds the blast
radius the [secret-delivery record](../../../docs/decisions/grinbox-secret-delivery.md)
leaves residual.

The one detection signal worth maintaining is a **cross-check
against Google's own view of the OAuth client.** Grinbox meters
every Gmail Resource operation it performs
(`triage_operator_runs.resource_usage_json`, `triage_events`), but
that ledger only covers calls made _through the Daemon_ — it cannot
see a stolen credential used from somewhere else. The Gmail API call
counts for the OAuth client in Google Cloud Monitoring (project-level,
per method) _can_: a material gap between Google's count and
Grinbox's self-reported count is usage the Daemon didn't originate.
This requires pulling the project metrics out-of-band and is
post-MVP (it sits with the Metrics work), but it is the only signal
that catches off-Grinbox use.

Grinbox does **not** alert on its own call rate — the Limits are the
runaway backstop, and rate anomalies in first-party traffic add
little for a single-User install. Note too that a State-DB-only leak
(the primary threat) yields refresh tokens that are unusable without
the bundle's `client_secret`, so this cross-check matters mainly for
a full guest compromise where both halves are taken.

---

## Re-auth

Re-authorizing an existing Account (after `invalid_grant`, or to
widen scopes) runs the _same_ `/oauth/start → popup → callback`
flow, bound to the existing `account_id` instead of creating a new
Account.

On success, the new grant replaces the old credential. The active
credential is enforced by the partial unique index
`idx_credentials_active_account` on `(user_id, kind, account_id)
WHERE deleted_at IS NULL` — so there is at most one live
`gmail_oauth` credential per Account. Re-auth therefore
**soft-deletes the prior `credentials` row and inserts a fresh
one** (rather than mutating in place), which keeps each grant
boundary and any scope change auditable in `change_log` and
respects the unique index. Polling resumes once the new credential
is live and the Account status clears.

---

## Multiple Accounts

Each Account is its own grant and its own `credentials` row; the
OAuth client is shared. Adding a second _distinct_ mailbox repeats the
flow. `prompt=consent` forces a fresh consent (and thus a guaranteed
refresh token) even when Google would otherwise skip the screen
for an already-granted client.

**Re-adding the same mailbox merges (upsert by email).** The callback
keys on the Gmail profile email: if a live Account with that email
already exists, the flow **returns and re-authorizes that Account**
rather than creating a duplicate — the fresh grant replaces the prior
credential exactly as [Re-auth](#re-auth) does. The invariant is _one
live Account per mailbox_: "Add Account" on an already-configured
address is therefore equivalent to Re-auth on it, never a second row.
(A soft-deleted Account with the same email does not block a fresh
add — only a live one merges.)

---

## Security summary

- **Public surface = one state-validated path.** Only
  `/oauth/callback` is routable on the TLS hostname; the UI and
  API are internal. Flows can only be _initiated_ internally via
  `/oauth/start`.
- **`client_secret` stays server-side** — never in the SPA, never
  in the DB, never logged.
- **PKCE + single-use, short-TTL `state`** protect the code
  exchange and the callback against interception and CSRF.
- **Tokens encrypted at rest**, excluded from `change_log`, never
  logged.
- **Scopes are minimal for the function set** (`modify` for
  read/label, `send` for Digest) — no broad `mail.google.com`.

---

## Relationship to Mailminder

Mailminder authorized Gmail with a one-shot **CLI loopback
bootstrap** (a Desktop client, `InstalledAppFlow` on
`localhost:8765`, refresh token printed to stdout and pasted into
LastPass). Grinbox moves authorization **into the web UI**: a Web
client, a pop-up consent, a server-side code exchange, and
encrypted token storage in the State DB instead of LastPass. The
durable-token requirements are identical (`access_type=offline`,
`prompt=consent`, Production publishing status); only the delivery
mechanism changed to suit a long-lived Daemon with a UI.

---

## Out of scope here

- **End-user login / multi-user auth** — sessions, per-User
  scoping enforcement. Distinct from Gmail-account authorization;
  tracked in [architecture.md](architecture.md)'s out-of-scope
  list and the [implementation plan](implementation-plan.md)
  backlog.
- **IMAP authentication** — a future Provider with its own
  credential `kind`; the `credentials` table already accommodates
  new kinds.
- **LLM token / cost budgeting** — unrelated to OAuth; noted in
  the implementation plan.
