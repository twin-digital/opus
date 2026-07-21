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

| Workflow              | Trigger                         | Purpose                                                                                                                       |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ci.yaml`             | pushes to `main`; PRs to `main` | The gate: `pnpm build` → `pnpm lint` → `pnpm test`, then release + deploy on `main`.                                          |
| `merge-checks.yaml`   | PRs to `main`                   | Fails if `README.md` or repo-kit config is out of sync (runs `pnpm update-readme` / `pnpm sync` and checks for a dirty tree). |
| `deploy.yaml`         | called by `ci.yaml` on `main`   | Deploys **production** (stage `prod`).                                                                                        |
| `deploy-preview.yaml` | CI completion (PR runs)         | Deploys the PR's **preview** stage (`pr-<number>`).                                                                           |
| `destroy-preview.yml` | PR closed                       | Tears down that PR's preview stage.                                                                                           |
| `publish.yaml`        | called by `ci.yaml` on `main`   | changesets release to npm, then GHCR image publish.                                                                           |

`publish.yaml` and `deploy.yaml` are **reusable workflows** (`on: workflow_call`) that `ci.yaml`
invokes from its own `main` run, with `needs: lint-build-test`, so **releases and production
deploys only proceed after CI succeeds** on exactly the commit being released. `deploy-preview.yaml`
still chains off CI via `workflow_run`, because it serves pull requests (see below).

### Fork pull requests and credentials

Anyone can open a pull request from a fork, and its CI run executes **the fork's version of the
workflow files** — an attacker can add jobs. What stops that reaching anything is the platform, not
a condition anyone maintains:

> With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is
> triggered from a forked repository. The `GITHUB_TOKEN` has read-only permissions in pull requests
> from forked repositories.

A workflow's own `permissions:` block cannot override this: permissions are computed workflow-level
first, job-level next, and the fork downgrade **last**. The settings that would relax it are
[available to private repositories only](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#enabling-workflows-for-forks-of-private-repositories),
and this repository is public.

Two consequences shape the design:

- **Privileged work runs only in the `push`-to-`main` CI run.** The caller jobs check
  `github.event_name == 'push' && github.ref == 'refs/heads/main'`, which for a `push` event is the
  branch actually pushed — so it requires write access here. That condition is scheduling, not the
  security boundary; the boundary is that a fork PR run has no secrets to hand out.
- **The `release` and `production` environment branch policies are live gates.** Both are pinned to
  `main`, and they match against `github.ref`. A fork PR run has `github.ref` of
  `refs/pull/<n>/merge`, so even a job that declared `environment: release` would be rejected
  before reaching a runner.

**This is why these workflows are not triggered by `workflow_run`.** A `workflow_run` workflow runs
in this repository's context _with secrets and a write token even when the run that triggered it had
neither_ — it re-privileges exactly what the fork rules deprivileged. Combined with checking out
`workflow_run.head_sha`, that is the "pwn request" pattern behind several published advisories
(GHSL-2024-320, GHSL-2024-226). Under `workflow_call` there is no such trigger to guard: the
credentials are unreachable rather than merely gated, and `github.ref`-based controls like the
environment branch policies start working, where under `workflow_run` they are inert (there,
`github.ref` is always the default branch).

If a future workflow does need `workflow_run`, it must verify the triggering run's provenance
itself — `workflow_run.event`, `workflow_run.head_repository.full_name` — because
`on.workflow_run.branches` matches the triggering run's _head branch_, which a fork controls.

### Deploy (`deploy.yaml` / `deploy-preview.yaml`)

- **production** (`deploy.yaml`) — runs inside the `main` CI run, after `lint-build-test`, so it
  deploys exactly the commit that was validated. Deploys to stage `prod` under the `production`
  environment.
- **preview** (`deploy-preview.yaml`) — fires when a CI run **for a PR** completes successfully.
  It filters to `workflow_run.event == 'pull_request'` (the push-triggered CI run for the same
  commit is ignored to avoid a double deploy), skips the changesets release PR, then resolves the
  open PR for the commit (via the GitHub API, so it works for same-repo and fork PRs) and deploys
  to stage `pr-<number>` under the `preview` environment. `destroy-preview.yml` removes that stage
  when the PR closes.

Both use OIDC (no static AWS keys): role `secrets.AWS_ROLE_ARN`, region `vars.AWS_REGION`,
Serverless Dashboard auth via `secrets.SERVERLESS_ACCESS_KEY`.

### Publish (`publish.yaml`)

Runs inside the `main` CI run, after `lint-build-test`. Every job checks out that run's own
commit, so the published version, its git tags, and the built images stay in lockstep — a newer
`main` commit can't be released or built under the just-published version tags.

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
gitignored). The script takes no arguments, and packages that don't define one simply get no
GitHub-hosted assets.

A release asset is a flat file, so only the **top-level regular files** in `.release-assets/` are
uploaded — subdirectories are ignored. `SHA256SUMS` is generated by the job, so a file of that
name written by the hook is replaced.

The `release-assets` job reads `publishedPackages` from the `changesets/action` output and runs
`pnpm release-assets --filter <pkg>` for each. The root script is `turbo run release-assets`, and
pnpm forwards the filters to it, so turbo applies them, builds each package first (the task
`dependsOn` `build`), and skips packages that don't define the script. The job then generates
**`SHA256SUMS`** per package and uploads it with the package's assets to the `<name>@<version>`
release. GitHub records a sha256 for each asset, but only as API metadata; `SHA256SUMS` is the
downloadable companion so consumers fetching plain URLs can verify with `sha256sum -c`.

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
