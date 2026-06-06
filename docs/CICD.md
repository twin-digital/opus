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

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yaml` | every push (any branch); PRs to `main` | The gate: `pnpm build` → `pnpm lint` → `pnpm test`. |
| `merge-checks.yaml` | PRs to `main` | Fails if `README.md` or repo-kit config is out of sync (runs `pnpm update-readme` / `pnpm sync` and checks for a dirty tree). |
| `deploy.yaml` | CI completion on `main` | Deploys **production** (stage `prod`). |
| `deploy-preview.yaml` | CI completion (PR runs) | Deploys the PR's **preview** stage (`pr-<number>`). |
| `destroy-preview.yml` | PR closed | Tears down that PR's preview stage. |
| `publish.yaml` | CI completion on `main` | changesets release to npm, then GHCR image publish. |
| `apply-rulesets.yaml` | push to `main` touching `.github/rulesets/**`; manual | Reconciles the `main` branch ruleset to the committed config. |

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

All three release jobs check out `github.event.workflow_run.head_sha` — the exact commit CI
validated — so the published version, its git tags, and the built images stay in lockstep (a
newer `main` commit can't be released/built under the just-published version tags).

1. **publish** — `changesets/action` either opens/updates the **"Version Packages"** PR (when
   changesets are pending) or, when none are pending, publishes packages with
   `pnpm publish-packages` and pushes git tags. Uses `CHANGESETS_GITHUB_TOKEN` + `NPM_TOKEN`.
2. **docker-matrix** — only after a publish (no pending changesets). `tooling/scripts/bin/docker-packages.js`
   reads the git tags on `HEAD` and selects the just-released packages that have a `Dockerfile`.
   (This is why the lookup must run on the same `head_sha` the publish job tagged.)
3. **docker-build-publish** — matrix per package: `pnpm run artifact --filter <pkg>` builds the
   image to `.out/`, which is then tagged `latest` / `major` / `minor` / `patch` and pushed to
   `ghcr.io`.
4. **docker-status-check** — fails the run if any image build failed.

## Branch protection (ruleset as code)

The `main` branch ruleset is **managed as code**, not hand-edited in the GitHub UI. The desired
state lives in [`.github/rulesets/main.json`](../.github/rulesets/main.json) and
`apply-rulesets.yaml` reconciles the live ruleset to it: edit the JSON in a PR (the diff is the
review), and on merge to `main` the workflow applies it. `workflow_dispatch` re-applies on demand
(drift correction). The workflow resolves the ruleset by name, so a recreated/missing ruleset is
re-applied (or created) rather than silently diverging.

What the ruleset enforces: PR required (1 approving review, code-owner review, squash-only);
required status checks `lint-build-test`, `merge-checks`, `renovate-changeset-present`, and
`Socket Security: Pull Request Alerts`; linear history; signed commits; no branch deletion; and no
bypass actors.

Managing rulesets needs **Administration: write**, which the default `GITHUB_TOKEN` cannot be
granted — so the apply step uses `COCOBOT_GITHUB_TOKEN` (must have repo admin).

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

| Name | Kind | Used for |
| --- | --- | --- |
| `AWS_ROLE_ARN` | secret | OIDC role assumed for all deploys |
| `AWS_REGION` | variable | deploy region |
| `SERVERLESS_ACCESS_KEY` | secret | Serverless Framework Dashboard auth |
| `CHANGESETS_GITHUB_TOKEN` | secret | opening the Version Packages PR / pushing tags |
| `NPM_TOKEN` | secret | publishing packages to npm |
| `COCOBOT_GITHUB_TOKEN` | secret | checkout token for deploy/preview jobs; ruleset apply (needs repo admin) |

Environments `preview` and `production` gate the corresponding deploy jobs.
