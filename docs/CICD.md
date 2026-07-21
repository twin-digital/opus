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

A fork's PR run executes **the fork's version of the workflow files**, so an attacker can add jobs.
These are the platform guarantees that decide what such a run can reach — each is documented
behavior, not a condition anyone here maintains.

**Fork runs are deprivileged**

- Fork PR runs get **no secrets**, and `GITHUB_TOKEN` is **read-only** —
  [Use secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- A workflow **cannot grant itself out of that**: the fork downgrade applies after workflow- and
  job-level `permissions:`, and the setting that relaxes it is
  [private repositories only](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#enabling-workflows-for-forks-of-private-repositories)
  (this repo is public)

**`workflow_run` re-privileges them**

- A `workflow_run` workflow runs **with secrets and a write token even when the triggering run had
  neither** —
  [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- `github.ref` is **always the default branch** for `workflow_run`, so `github.ref` conditions and
  environment branch policies are **inert** there —
  [same](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- `on.workflow_run.branches` filters the **triggering run's head branch**, which a fork controls —
  [same](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)

**`workflow_call` keeps them deprivileged**

- A called workflow gets **no secrets unless passed or inherited**; `environment:` on the inner job
  resolves **that environment's** secrets —
  [Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#passing-inputs-and-secrets-to-a-reusable-workflow)
- Caller `permissions:` is a **ceiling**: permissions "can only be maintained or reduced — not
  elevated" through the chain —
  [same](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#calling-a-reusable-workflow)
- Environment **deployment branch policies evaluate `github.ref`** — truthful under `push`, so they
  gate for real —
  [Manage environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments#creating-an-environment)

**OIDC identity**

- `sub` names **the repository the run belongs to** (`repo:OWNER/REPO:environment:NAME`) — for a
  reusable workflow that is the **caller**, so a third-party caller of our public workflows cannot
  match ours —
  [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc#example-subject-claims)
  ·
  [OIDC with reusable workflows](https://docs.github.com/actions/deployment/security-hardening-your-deployments/using-openid-connect-with-reusable-workflows)
- `job_workflow_ref` names the **called** workflow and is identical for every caller, so it must
  **never be the only pinned claim** — pin `sub` first —
  [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc#custom-claims-provided-by-github)

**Relied on here, but not documented by GitHub** — verify before treating as load-bearing:

- Caller `env:` does not propagate into a called workflow (why `publish`/`deploy` are _called_, not
  inlined — `ci.yaml`'s `NPM_CONFIG_IGNORE_SCRIPTS` would otherwise break the release install).
- A fork PR run cannot mint an OIDC token. It follows from the write-downgrade rule, but is nowhere
  stated — which is why the environment branch policies are kept as an independently documented
  second layer.
- Whether `job_workflow_ref` is populated for jobs defined directly in a triggered workflow (the
  docs describe only the reusable case).

**What this forces.** Releasing and deploying live inside the `push`-to-`main` CI run as reusable
workflows, so the credentials have no trigger of their own to guard and a fork PR run simply has
nothing to hand out. Because those jobs run under `push`, `github.ref` is truthful, so the `release`
and `production` branch policies act as a second gate that GitHub enforces independently of any
condition in these files. `deploy-preview.yaml` keeps `workflow_run` because it must serve fork PRs
— its decision job holds no credentials, and the deploy is opt-in behind a label only writers can
apply.

**Rules for new workflows**

- Don't put credentials behind a `workflow_run` trigger. If one is unavoidable, gate on
  `workflow_run.event` and `workflow_run.head_repository.full_name` — not on `branches:`,
  `github.ref`, or `conclusion`, none of which constrain provenance.
- Pin OIDC trust policies on `sub` first; add `job_workflow_ref` to narrow further.
- Don't add a `tags:` filter to `ci.yaml` — tag pushes would retrigger CI and create a
  publish → tag → CI → publish loop.

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

## References

Advisories illustrating what the rules above prevent — all three are workflows that ran privileged
in the base repo's context on behalf of an untrusted pull request:

- [GHSL-2024-226/227 — Cilium](https://securitylab.github.com/advisories/GHSL-2024-226_GHSL-2024-227_Cilium/):
  a `workflow_run`-chained workflow read registry secrets while running attacker-controlled code,
  allowing exfiltration by dumping runner memory. Its gate checked the triggering run's
  **conclusion**, which says nothing about provenance.
- [GHSL-2024-320/321 — Eclipse JDT](https://securitylab.github.com/advisories/GHSL-2024-320_GHSL-2024-321_Eclipse/):
  a workflow triggered by PR-check completion interpolated an **attacker-controlled branch name**
  into a bash `run:` block, leaking an org-write PAT.
- [GHSL-2023-181 — PyTorch](https://securitylab.github.com/advisories/GHSL-2023-181_Pytorch/):
  same primitive under `pull_request_target` — a malicious branch name expanded inside `run:`.

Hence the house rule that event payload values reach `run:` through `env:`, never inline `${{ }}`.

Platform direction:

- [Safer `pull_request_target` defaults for `actions/checkout`](https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout/)
  (2026-06-18) — checkout v7 refuses fork-PR checkout by default under `pull_request_target`, and
  under `workflow_run` when the triggering event was a `pull_request*` event; backported to all
  supported majors on 2026-07-16. `deploy-preview.yaml` does exactly this, deliberately, and is
  shielded only by its SHA pin until the next bump.

Findings from the audit behind this design:

- `on.workflow_run.branches` really does match the fork's branch: `cli/cli` has fork-PR runs whose
  `head_branch` is `trunk` — the **fork's** default branch name, not the base repo's.
- This repo has had **zero** fork-origin Actions runs, so the gap the `workflow_call` conversion
  closed was never exercised.
- The `preview` environment has no protection rules, making the write-access-only `preview` label
  the sole gate before fork code meets preview deploy credentials.
- The deploy roles previously also trusted `sub = repo:twin-digital/opus:ref:refs/heads/main`, which
  under `workflow_run` (where `github.ref` is always the default branch) any non-environment job
  could have matched. Removed in `twin-digital/aws`; the roles now pin the environment subject, and
  the production roles additionally pin `job_workflow_ref`.
