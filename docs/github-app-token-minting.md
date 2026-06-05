# GitHub token minting (KMS-signed)

Gives the devcontainer short-lived, scoped GitHub **App installation tokens** without a broker
server. The App private key lives in **AWS KMS** (imported, non-extractable); the container signs
the App JWT via `kms:Sign` using its **ambient AWS credentials**, then exchanges it for a ~1h
installation token. Tokens are minted on demand — by the `gh` wrapper, for both `gh` and git over
HTTPS — and re-minted from cache as they expire; nothing ambient to keep fresh.

**The human gate is your AWS/SSO session** — minting works while those creds are valid and stops
when they expire/are revoked. There's no per-mint touch (unlike the old SSH broker).

## Pieces

| Script | Role |
| --- | --- |
| `import-app-private-key` | **one-time:** import the App `.pem` into a KMS sign-only key |
| `gh-app-token` | mint: App JWT → `kms:Sign` → scoped installation token (`<exp> <token>`) |
| `gh-token-seed` | pre-warm the cache at session start; report failures to the hook |
| `gh-token-get` | serve cache / re-mint when stale (fail-open) — the one place tokens are obtained |
| `gh` (wrapper) | put a fresh token in `GH_TOKEN`, then exec real gh — authenticates `gh` **and** git (via `gh auth git-credential`) for terminal + agents |
| `post-create.d/20-configure-git-credentials.sh` | wire the opus checkout to HTTPS + `gh auth git-credential` (repo-local) |
| `.claude/hooks/on-session-start` | pre-warm the cache + warn if minting fails (no longer sets `GH_TOKEN`) |
| `devcontainer.json` `containerEnv` | App config (`APP_ID`/`INSTALLATION_ID`/`KMS_KEY_ID`/scope) — inherited by terminal **and** agents |

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

4. **Configure** — set in `devcontainer.json` `containerEnv` (committed; non-secret) so both your
   terminal and agents inherit it: `APP_ID`, `INSTALLATION_ID`, `KMS_KEY_ID` (the alias
   `alias/github-app-signer` — account-agnostic, unlike an ARN), and `GH_TOKEN_REPOS`.
   `GH_TOKEN_PERMS` is intentionally **omitted** so tokens inherit the App installation's full
   permission grant — scope is managed App-side (tighten/loosen the App's granted permissions in
   GitHub). `AWS_PROFILE` is **not** here (its value embeds the account number) — it stays in your
   shell and in gitignored `.claude/settings.local.json` for agents. (`gh-app-token` also falls
   back to `/etc/gh-token/minter.conf` if these aren't in the env.)

5. **Nothing to do for git** — `post-create.d/20-configure-git-credentials.sh` wires the opus
   checkout to HTTPS + `gh auth git-credential` (via the `gh` wrapper). `git push` and `gh` then
   authenticate on demand; no `gh auth login`, no SSH keys.

6. **Rebuild the devcontainer** (so the scripts land in `/usr/local/bin` and `containerEnv`
   applies), or for a quick test:
   `sudo install -m755 .devcontainer/scripts/container/{gh,gh-app-token,gh-token-get,gh-token-seed} /usr/local/bin/`
   (then run `post-create.d/20-configure-git-credentials.sh`, or just `bash` it, to wire git).

## Verify

```bash
gh-app-token                 # "<epoch> <token>"  (signs via KMS, mints)
gh repo view twin-digital/opus           # gh wrapper mints on demand — no GH_TOKEN needed
git -C /workspace/opus ls-remote origin  # git over HTTPS, same token, via gh auth git-credential
```
Works from your terminal and from agents alike, and stays working as the token rotates.

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

- `GH_TOKEN_REPOS` / `GH_TOKEN_PERMS` narrow *below* the App grant; **omitting** either takes the
  App's full set for that axis. We omit `GH_TOKEN_PERMS` (permissions managed App-side) and keep
  `GH_TOKEN_REPOS` scoped to opus. The CI publish token requests `contents`+`pull_requests`
  explicitly (least privilege for the automated path).
- Config resolves from the environment first (set in `containerEnv`, so both terminal and agents
  have it), falling back to `/etc/gh-token/minter.conf` if absent.
- The `gh` wrapper mints the opus-scoped token for **all** `gh` calls, so `gh` against your other
  GitHub repos in this container would use the wrong-scope token. Fine for an opus container.
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
