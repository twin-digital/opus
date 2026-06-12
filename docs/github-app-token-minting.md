# GitHub credentials (KMS-signed App tokens)

All GitHub access — interactive and CI — uses short-lived (~1h), scoped **GitHub App
installation tokens**. The App private key lives in **AWS KMS** (imported, non-extractable);
nothing ever holds a long-lived GitHub credential. What varies is _who may ask KMS to sign_:

- **Workspace (terminal + agents):** tokens are **vended** by the privileged admin sidecar onto
  a read-only shelf (`/creds/github/opus`, format `<exp_epoch> <token>`). The `gh` wrapper
  serves them to `gh` and — via `gh auth git-credential` — to git over HTTPS, for terminal and
  agents alike. The workspace holds **no `kms:Sign`**: it cannot mint a token or widen scope;
  the human gate is the admin's SSO session in the sidecar, which keeps the shelf vended.
  Mechanism, lifecycles, and troubleshooting live with the workspace devcontainer (outside this
  repo): `/workspace/.devcontainer/README.md`.
- **CI (`publish.yaml`):** inlines the JWT → `kms:Sign` → token exchange in a workflow step,
  gated by **GitHub OIDC → a tightly-scoped AWS role** (see [In CI](#in-ci-publish-workflow)).

## Scope model

- The App installation's granted permissions are the **ceiling**. View/change: GitHub →
  Settings → Developer settings → GitHub Apps → _the app_ → **Permissions & events**; permission
  changes must then be **accepted by each installation** (org → Settings → GitHub Apps →
  Configure) before they take effect.
- Every token is narrowed below that ceiling **at mint time, by the minter** — never by the
  consumer: the sidecar's `VEND_GH_REPOS` / `VEND_GH_PERMS` (compose environment) for workspace
  tokens; an explicit permission set in `publish.yaml` for CI.
- To confirm what a token actually carries: the mint response
  (`POST /app/installations/{id}/access_tokens`) echoes `.permissions` and `.repositories`.

## One-time setup (App + key)

1. **Create the GitHub App** (org → Settings → Developer settings → GitHub Apps): webhook off;
   grant the permission ceiling deliberately. Note the **App ID**; generate a private key
   (`.pem`); install on the repo(s) and note the **Installation ID**.
2. **Import the key into KMS** from the admin sidecar (`import-app-private-key /path/to/app.pem`,
   then `shred -u` the pem — the key is then non-extractable; default alias
   `alias/github-app-signer`). Requires `kms:CreateKey`/`kms:ImportKeyMaterial` etc.
3. **Grant `kms:Sign`** on that key to the minters only: the sidecar's minting profile role and
   the CI minter role — least privilege, ideally roles whose only permission is this.

## Policy: agents create and run workflows

This repo assumes agents (and the vended token) will **author and run GitHub Actions
workflows** — that's an intended part of how they work. A workflow is arbitrary code executing
in CI, so treat the token/container as able to run CI. The consequence is a hard rule:

> **Every secret, deployment, and otherwise sensitive operation must be gated behind a GitHub
> Environment protection rule that requires human approval** — never reachable by an unattended
> workflow run alone.

### Gating with environment protection rules

GitHub **Environments** are the gate: a job that names an environment pauses for that
environment's protection rules before running, and only jobs in that environment can read its
secrets or assume an OIDC role whose trust is scoped to it.

1. **Repo → Settings → Environments** → pick/create the sensitive one (this repo uses
   `production` for deploys and `preview` for ephemeral PR stages).
2. On `production`, enable **Required reviewers** (≥1 human) — optionally a wait timer / branch
   restrictions. The job then blocks on a manual approval before it runs.
3. **Put the sensitive bits behind it:** store deploy/release secrets as **environment** secrets
   (not repo secrets), and scope the AWS OIDC role's trust to
   `repo:twin-digital/opus:environment:production`. Now neither the secret nor the role is
   reachable without passing the human gate — even from a workflow an agent authored.
4. Reference: `deploy.yaml` runs in `environment: production`; `deploy-preview.yaml` /
   `destroy-preview.yml` in `environment: preview`. Any new release-/infra-affecting job should
   sit in a protected environment, not run unguarded. (Gating the `publish.yaml` release path
   the same way is a reasonable follow-up — it isn't environment-gated today.)

## Threat model (short)

- **App key:** non-extractable in KMS; every signature is a CloudTrail `kms:Sign` event.
- **Workspace compromise** yields only the currently-vended tokens (≤1h, pre-scoped) — no
  minting capability, no path to widen scope. Escalation requires a human acting in the sidecar.
- **The things that can mint** are the sidecar's minting profile (gated by the admin's SSO
  session) and the CI OIDC role (gated by GitHub's OIDC trust conditions). Scope both roles to
  `kms:Sign` on the one key.
- **Cost:** ~$1/month (the KMS key); per-sign requests are negligible at this volume.

## Notes

- **No ambient `$GH_TOKEN`** — auth flows through `gh`/git only. If a script needs the raw
  token, run `gh-token-get` (e.g. `TOKEN="$(gh-token-get)"`).
- The `gh` wrapper serves the opus-scoped token for **all** `gh` calls, so `gh` against other
  GitHub repos in this container uses a wrong-scope token. Fine for an opus container; for other
  vended tokens, `GH_TOKEN_SHELF` selects the shelf file.
- **Clone opus over HTTPS** so git authenticates with the App token. An SSH clone would use your
  own keys/agent instead.

## In CI (publish workflow)

`publish.yaml` mints its own token to push the changesets "Version Packages" PR and tags (its
pushes re-trigger downstream workflows, which the default `GITHUB_TOKEN` can't). It inlines the
JWT→`kms:Sign`→token exchange in a step; the gate is **GitHub OIDC → a tightly-scoped AWS
role**, not an SSO session. Config comes from repo settings:

| CI source                     | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `vars.GH_APP_ID`              | App id                                  |
| `vars.GH_APP_INSTALLATION_ID` | installation to mint against            |
| `vars.GH_APP_KMS_KEY`         | KMS key alias/id                        |
| `vars.GH_APP_MINTER_ROLE_ARN` | role assumed via OIDC to get `kms:Sign` |

See `.github/workflows/publish.yaml` and `docs/CICD.md`.
