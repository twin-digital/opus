# GitHub token minting (KMS-signed)

Gives the devcontainer short-lived, scoped GitHub **App installation tokens** without a broker
server. The App private key lives in **AWS KMS** (imported, non-extractable); the container signs
the App JWT via `kms:Sign` using its **ambient AWS credentials**, then exchanges it for a ~1h
installation token. `GH_TOKEN` auto-refreshes (re-mints) as it expires.

**The human gate is your AWS/SSO session** — minting works while those creds are valid and stops
when they expire/are revoked. There's no per-mint touch (unlike the old SSH broker).

## Pieces

| Script | Role |
| --- | --- |
| `import-app-private-key` | **one-time:** import the App `.pem` into a KMS sign-only key |
| `gh-app-token` | mint: App JWT → `kms:Sign` → scoped installation token (`<exp> <token>`) |
| `gh-token-seed` | pre-warm the cache at session start; report failures to the hook |
| `gh-token-get` | per-Bash-call: serve cache / re-mint when stale (fail-open) |
| `.claude/hooks/on-session-start` | wires dynamic `GH_TOKEN`, runs the seed |
| `.claude/settings.json` | config (`env`) + the hook registration (committed) |

(All container scripts live in `.devcontainer/scripts/container/` and are copied to
`/usr/local/bin` on container build.)

## One-time setup

1. **Create the GitHub App** (org → Settings → Developer settings → GitHub Apps): uncheck
   Webhook → Active; Repository permissions = least set (Contents R/W, Pull requests R/W);
   note the **App ID**; generate a **private key** (`.pem`); install on the repo(s) and note the
   **Installation ID**.

2. **Import the key into KMS** (ambient AWS creds must allow `kms:CreateKey`, `kms:CreateAlias`,
   `kms:GetParametersForImport`, `kms:ImportKeyMaterial`, `kms:DescribeKey`):
   ```bash
   import-app-private-key /path/to/app.pem            # prints the KMS key ARN; default alias/github-app-signer
   shred -u /path/to/app.pem                           # the key is now non-extractable in KMS
   ```

3. **Grant `kms:Sign`** on that key to the role the container runs as (least privilege — ideally
   a dedicated role whose only permission is this):
   ```json
   { "Effect": "Allow", "Action": ["kms:Sign"],
     "Resource": "arn:aws:kms:<region>:<acct>:key/<KEY_ID>" }
   ```

4. **Configure** — set in `.claude/settings.json` `env` (committed; the App/Installation IDs are
   non-secret): `APP_ID`, `INSTALLATION_ID`, `KMS_KEY_ID` (the ARN from step 2, or its alias —
   `alias/github-app-signer` is what ships), and the least-privilege `GH_TOKEN_REPOS` /
   `GH_TOKEN_PERMS`. (For manual/non-Claude use these can instead live in `/etc/gh-token/minter.conf`.)

5. **`gh auth setup-git`** once, so `git push` over HTTPS uses `GH_TOKEN`.

6. **Rebuild the devcontainer** (so the scripts land in `/usr/local/bin`), or for a quick test:
   `sudo install -m755 .devcontainer/scripts/container/gh-* /usr/local/bin/`.

## Verify

```bash
gh-app-token                 # "<epoch> <token>"  (signs via KMS, mints)
GH_TOKEN="$(gh-token-get)" gh repo view twin-digital/opus
```
Then start a fresh Claude session — `gh`/`git` are authenticated and stay so as the token rotates.

## Threat model (short)

- **App key:** non-extractable in KMS. A container compromise can `kms:Sign` (mint scoped tokens)
  only while AWS creds are valid — it cannot steal a permanent key.
- **The thing to scope:** the container's **AWS credentials**. If they're a broad role, an exfil =
  everything that role can do. Use a dedicated minimal role (`kms:Sign` on one key). This rides on
  the broader "pare down agent AWS access" work.
- **Audit:** every mint is a CloudTrail `kms:Sign` event; `gh-app-token` also logs to syslog
  (never the token).
- **Cost:** ~$1/month (the KMS key); per-sign requests are negligible at this volume.

## Notes

- `GH_TOKEN_REPOS` / `GH_TOKEN_PERMS` are the least-privilege dial, hard-capped by the App grant.
- Config resolves from `env` first (Claude), falling back to `/etc/gh-token/minter.conf` for
  manual/non-Claude use.
- Dependencies in the container: `aws`, `openssl`, `curl`, `jq` (+ `base64`, `od` for the import).

## In CI (publish workflow)

`publish.yaml` mints the same kind of token to push the changesets "Version Packages" PR and tags
(its pushes re-trigger downstream workflows, which the default `GITHUB_TOKEN` can't). It does **not**
use these container scripts — it inlines the JWT→`kms:Sign`→token exchange in a step — but the moving
parts are identical. The gate there is **GitHub OIDC → a tightly-scoped AWS role**, not an SSO session.
Config comes from repo settings (the same names the scripts read, mapped from CI-side names):

| CI source | Maps to |
| --- | --- |
| `vars.GH_APP_ID` | `APP_ID` |
| `vars.GH_APP_INSTALLATION_ID` | `INSTALLATION_ID` |
| `vars.GH_APP_KMS_KEY` | `KMS_KEY_ID` |
| `secrets.GH_APP_MINTER_ROLE_ARN` | role assumed via OIDC to get `kms:Sign` |

See `.github/workflows/publish.yaml` and `docs/CICD.md`.
