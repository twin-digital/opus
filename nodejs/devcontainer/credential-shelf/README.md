# @twin-digital/credential-shelf

The **credential vendor sidecar** — one image, N vend loops. It reads a unified `vend.yaml`
and runs an AWS loop if any `aws-sso` provider is configured and a GitHub loop
per `github-app` grant, writing short-lived, scoped credentials onto a read-only `/creds`
shelf that consumers (a dev container, an agent) mount. The full SSO session and `kms:Sign`
stay in this container; only the vended roles' ≤1h creds / scoped tokens reach the shelf.

Published as `ghcr.io/twin-digital/credential-shelf` (built + pushed by the monorepo
publish workflow — a `Dockerfile` + changeset is all it takes). Node + the AWS CLI; it
shells to `aws-cli` for STS export and KMS signing (no AWS SDK), with `yaml` its one
runtime dependency.

## (a) Configure — `vend.yaml`

A list of `providers`, each `kind` + `options` (how to reach the source) + `grants` (what to
mint). Baked into the image, **not** a `/workspace` bind-mount, so a scope change is a
reviewed rebuild — provide your own by deriving an image:

```dockerfile
FROM ghcr.io/twin-digital/credential-shelf:latest
COPY vend.yaml /etc/credential-shelf/vend.yaml
```

```yaml
providers:
  - kind: aws-sso
    options:
      start_url: https://d-xxxxxxxxxx.awsapps.com/start/
      region: us-east-1 # optional, default us-east-1
      session: sso # optional, default "sso" ([sso-session] name)
    grants: # → /creds/aws/credentials; first = [default]
      - account_id: '084828590319'
        role: developer-ai-agent
        # name: developer          # optional, default <account_id>-<role>

  - kind: github-app # one provider == one App; its installations are grants
    options:
      app_id: '3967552'
      kms_key_id: alias/github-app-signer
      region: us-east-1 # optional, KMS region
      signer: # aws identity holding kms:Sign
        account_id: '253490790167'
        role: developer-tool-user
    grants: # → /creds/github/<name>, one per installation
      - name: myorg
        installation_id: '139694269'
        # repos: [app, infra]      # optional (omit => all installed)
        # perms: { contents: read }    # optional (omit => App's full grant)
```

- **Multiple instances** are just more array entries — several SSO instances, several Apps.
- **`aws-sso`** grants share the single `/creds/aws/credentials` file; the first grant overall is `[default]`.
- **`github-app`** is one App per provider; each grant is one installation → `/creds/github/<name>`. The same App can vend several differently-scoped tokens (repeat the `installation_id` across grants).
- **The signer** is the AWS identity that holds `kms:Sign`. It's written to `~/.aws/config` (so the GitHub loops can sign) but **never** added to the shelf vend-list, so a `kms:Sign` credential never reaches consumers. It uses the first `aws-sso` session unless you set `options.signer.session`.
- Baked default is `providers: []` (idle).

## (b) Authenticate (once the container is running)

The sidecar renders `~/.aws/config` at start but can't vend until it holds an SSO session.
Log in **once per SSO session** (org default ~8h), from a **host** terminal — the session
lives only in the sidecar, never in a consumer:

```sh
docker exec -it <project>-credentials-1 credential-shelf refresh
```

`refresh` runs the device-code SSO login for every configured session (no profile name to
remember) and vends AWS once; the GitHub loops re-mint on their own once the signer session
is back. Re-run it whenever a session lapses. Health: `cat /creds/status/*` (`ok expires=…`
per loop, or `stalled …`).

## Vends

- `/creds/aws/credentials` — `[default]` + a section per `aws-sso` grant.
- `/creds/github/<name>` — `{"value":"<token>","expires_at":<epoch>}`, one per `github-app` grant.
- `/creds/status/{aws,github-<name>}` — `ok expires=…` / `stalled …` health stamps.

## Commands

`credential-shelf start` (default / `ENTRYPOINT`) supervises the vend loops; `credential-shelf
refresh` does the recurring SSO login. `import-app-private-key <app-key.pem>` is the one-time
setup that imports the GitHub App's RSA key into KMS as a non-extractable signing key — run it
once (with KMS-create perms) and set its alias as the `github-app` provider's `kms_key_id`.

The `/creds` shelf wire contract, the security model, and the future broker design live in
[docs/devcontainer/](../../../docs/devcontainer/) (`SECRETS.md`, `SECURITY.md`,
`CREDENTIAL-BROKER.md`).
