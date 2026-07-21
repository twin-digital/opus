# CI/CD

How this monorepo validates, deploys, and publishes. Everything runs in **GitHub Actions**
(`.github/workflows/`). Builds use **pnpm + turbo**; infrastructure deploys via the
**Serverless Framework** (v4, org `twindigital`); npm releases use **changesets**; container
images publish to **GHCR**.

> An earlier CDK/Step-Functions design ([`superseded/cdk-cicd.md`](./superseded/cdk-cicd.md))
> was never implemented and does not describe this repo. This document is the source of truth.

## Shared building blocks

- **`.github/actions/setup`** — installs pnpm, installs Node from `.nvmrc`, then runs
  `pnpm install --frozen-lockfile`. Used by every job (after a separate checkout step).
- **`.github/actions/deploy`** — assumes the AWS OIDC role, runs `pnpm serverless update`, then
  `turbo run deploy|destroy -- --stage <stage> --region <region>`. Driving deploys through turbo
  means dependencies build (tsdown → `dist/`) before Serverless packages them.

## Workflows

| Workflow              | Trigger                                | Purpose                                                                                                                       |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ci.yaml`             | every push (any branch); PRs to `main` | The gate: `pnpm build` → `pnpm lint` → `pnpm test`.                                                                           |
| `merge-checks.yaml`   | PRs to `main`                          | Fails if `README.md` or repo-kit config is out of sync (runs `pnpm update-readme` / `pnpm sync` and checks for a dirty tree). |
| `deploy.yaml`         | CI completion on `main`                | Deploys **production** (stage `prod`).                                                                                        |
| `deploy-preview.yaml` | CI completion (PR runs)                | Deploys the PR's **preview** stage (`pr-<number>`).                                                                           |
| `destroy-preview.yml` | PR closed                              | Tears down that PR's preview stage.                                                                                           |
| `publish.yaml`        | CI completion on `main`                | changesets release to npm, then GHCR image publish.                                                                           |

`deploy.yaml`, `deploy-preview.yaml`, and `publish.yaml` all chain off CI via `workflow_run`,
so **infrastructure and releases only proceed after `ci.yaml` succeeds** — both production and
preview deploys are gated on a passing CI run for that exact commit.

### Deploy (`deploy.yaml` / `deploy-preview.yaml`)

Both jobs check out `github.event.workflow_run.head_sha` — the exact commit CI validated, not
whatever the branch points at by the time the deploy runs.

- **production** (`deploy.yaml`) — fires when CI completes successfully on `main`. Deploys to
  stage `prod` under the `production` environment.
- **preview** (`deploy-preview.yaml`) — fires when a CI run **for a PR** completes successfully.
  It filters to `workflow_run.event == 'pull_request'` (the push-triggered CI run for the same
  commit is ignored to avoid a double deploy), skips the changesets release PR, then resolves the
  open PR for the commit (via the GitHub API, so it works for same-repo and fork PRs) and deploys
  to stage `pr-<number>` under the `preview` environment. `destroy-preview.yml` removes that stage
  when the PR closes.

Both use OIDC (no static AWS keys): role `secrets.AWS_ROLE_ARN`, region `vars.AWS_REGION`,
Serverless Dashboard auth via `secrets.SERVERLESS_ACCESS_KEY`.

### Publish (`publish.yaml`)

All release jobs check out `github.event.workflow_run.head_sha` — the exact commit CI
validated — so the published version, its git tags, and the built images stay in lockstep (a
newer `main` commit can't be released/built under the just-published version tags).

1. **publish** — `changesets/action` either opens/updates the **"Version Packages"** PR (when
   changesets are pending) or, when none are pending, publishes packages with
   `pnpm publish-packages` and pushes git tags. Uses an OIDC→KMS-minted GitHub App token (for the
   GitHub side: the PR and tags) and `NPM_TOKEN` (from the `release` environment) for npm.
2. **docker-matrix** — only after a publish (no pending changesets). `tooling/scripts/bin/docker-packages.js`
   reads the git tags on `HEAD` and selects the just-released packages that have a `Dockerfile`.
   (This is why the lookup must run on the same `head_sha` the publish job tagged.)
3. **docker-build-publish** — matrix per package: `pnpm run artifact --filter <pkg>` builds the
   image to `.out/`, which is then tagged `latest` / `major` / `minor` / `patch` and pushed to
   `ghcr.io`.
4. **docker-status-check** — fails the run if any image build failed.
5. **release-assets** — attaches downloadable files to the GitHub releases changesets created.
   See [Release assets](#release-assets) below.

#### Release assets

A package publishes files to its GitHub release by defining a **`release-assets`** script that
writes them into a `.release-assets/` directory in the package (creating it; the directory is
gitignored). The script is the whole contract — it takes no arguments, and packages that don't
define one simply get no GitHub-hosted assets.

The `release-assets` job reads `publishedPackages` from the `changesets/action` output, runs
`pnpm release-assets --filter <pkg>` for each (the turbo task depends on `build`, and turbo skips
packages without the script), then per package generates a **`SHA256SUMS`** file and uploads the
directory's contents to the `<name>@<version>` release. GitHub records a sha256 for each asset,
but only as API metadata; `SHA256SUMS` is the downloadable companion so consumers fetching plain
URLs can verify with `sha256sum -c`.

## Supply-chain scanning (dependency PRs)

Dependency-update PRs are gated by a **behavioral supply-chain scanner** — the [Socket.dev](https://socket.dev)
GitHub App — wired as a **required status check** so a bump's package contents are inspected before it
can merge (and, transitively, before Renovate auto-merges it). This is the **detection** layer on top
of Renovate's time-based cooldown; it catches novel install-script / runtime malware that an
advisory-database scanner cannot. Setup, the block/warn policy, and the activation order live in
[`cicd/supply-chain-scanning.md`](./cicd/supply-chain-scanning.md).

## Serverless services

Deployable apps (e.g. `nodejs/bookify/bookify-render-api`, `nodejs/apps/discord-bot`) each own a
`serverless.yml` (org `twindigital`, Serverless Dashboard, `provider: aws`, `runtime: nodejs24.x`).
Notes that hold across services:

- **Stages** are the deploy unit: `dev` (local default), `prod`, and ephemeral `pr-<number>`
  previews. Region is set per stage (currently `us-east-1`).
- **Packaging** uses the prebuilt `dist/` (`build.esbuild: false`) — tsdown is the bundler, not
  Serverless's esbuild.
- Services define their own AWS resources (DynamoDB tables, HTTP APIs, container/ECR images,
  CloudWatch alarms, Powertools env) inline in `serverless.yml`.

### Local deploys

From a service directory: `pnpm deploy:dev` / `pnpm deploy:prod` (or `serverless deploy --stage <stage>`),
`pnpm logs`, `pnpm invoke`, `pnpm remove`. Requires AWS credentials and a `SERVERLESS_ACCESS_KEY`.

## Required secrets & variables

Secrets are **environment-scoped** (there are no repo-level secrets); non-sensitive identifiers (role
ARNs, App/KMS ids) are **repo variables**.

| Name                                                      | Kind     | Scope                               | Used for                                               |
| --------------------------------------------------------- | -------- | ----------------------------------- | ------------------------------------------------------ |
| `AWS_ROLE_ARN`                                            | secret   | env: development/preview/production | OIDC role assumed for deploys                          |
| `SERVERLESS_ACCESS_KEY`                                   | secret   | env: preview/production             | Serverless Framework Dashboard auth                    |
| `NPM_TOKEN`                                               | secret   | env: release                        | publishing packages to npm                             |
| `AWS_REGION`                                              | variable | repo                                | deploy region                                          |
| `GH_APP_MINTER_ROLE_ARN`                                  | variable | repo                                | `kms:Sign`-only OIDC role for publish's App-token mint |
| `GH_APP_MINTER_ROLE_ARN_RENOVATE`                         | variable | repo                                | same, for the renovate-changeset mint                  |
| `GH_APP_ID` / `GH_APP_INSTALLATION_ID` / `GH_APP_KMS_KEY` | variable | repo                                | GitHub App identity + KMS key for token minting        |

Environments scope their secrets to the jobs that declare them — `development`/`preview`/`production`
for deploys, `release` for publish. `production` and `release` restrict deployments to `main`;
`development` requires a reviewer. The deploy/preview jobs check out with the default `github.token`
(no dedicated PAT).
