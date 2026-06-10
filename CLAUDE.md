# CLAUDE.md

Guidance for agents working in **Opus** (`@twin-digital/monorepo`) — Twin Digital's monorepo of public works. ESM-only TypeScript, managed with **pnpm** + **turbo**. Node 24, pnpm 10.

## Layout

Packages live under `nodejs/<group>/<package>` (workspace globs `nodejs/*` and `nodejs/*/*`) plus `tooling/scripts`. Groups are domains, not layers:

- `apps/` — deployable services (e.g. context-server, discord-bot)
- `core/`, `core-aws/` — shared runtime libraries (logging, CLI, AWS/Lambda observability + test helpers)
- `devtools/` — shared build/config packages: `tsconfig`, `eslint-config`, `vitest-config`, `repo-kit`, `serverless-dev-tools`
- `genai/`, `dolmenwood/`, `bookify/` — product/domain packages
- `tooling/scripts` (`@twin-digital/opus-scripts`) — the `build`/`clean`/`lint`/`test`/`watch`/`artifact` bin commands every package's scripts shell out to

The README package list (between `repo-kit` markers) is generated — see Config below.

## Monorepo architecture (essentials)

- **Source-first via the `source` export condition.** Packages expose `"source": "./src/index.ts"` in `exports`; consumers set `customConditions: ["source"]` in tsconfig (and bundlers match it). Consequence: **you never build a dependency before its consumer** — TS/tooling resolves straight to a dependency's `src/`. Just work in `src/` and build/test the package you're editing. (Full rationale in `README.md`.)
- **Internal deps use `workspace:*`; shared third-party versions use `catalog:`** (defined in `pnpm-workspace.yaml`). Add a shared dep to the catalog rather than pinning a version per package.
- **ESM + NodeNext.** Relative imports **must** carry explicit `.js` extensions (`./foo.js`, not `./foo`). `verbatimModuleSyntax` is on, so use `import type { ... }` for type-only imports.

## Commands

Run from the repo root; turbo fans out across packages and respects the dependency graph.

```
pnpm build       # turbo run build  (opus-scripts → tsdown/tsc, emits dist/)
pnpm test        # turbo run test   (vitest)
pnpm lint        # turbo run lint   (eslint)
pnpm typecheck   # turbo run typecheck (tsc --noEmit)
pnpm dev         # build, then watch-build all packages in parallel
```

Scope to one package with turbo filters, e.g. `pnpm build --filter @twin-digital/bookify`, or run a package's own scripts (`test:watch`, `lint:fix`, etc.) from its directory. Per-package script names are uniform because they're synced (see Config).

## Conventions

- **TypeScript** is `strict` (full `strictTypeChecked` + `stylisticTypeChecked` eslint presets). Prefer fixing types over `any`; `_`-prefixed names opt out of unused-var checks.
- **Tests** are colocated `*.test.ts` next to source, run with **vitest** (`describe`/`it`/`expect`). Packages extend `@twin-digital/vitest-config` (`export default sharedConfig`). AWS code uses `aws-sdk-client-mock`; Lambda code uses `@twin-digital/lambda-test-lib` for mock contexts/metrics.
- **Public surface** is a barrel `src/index.ts`; subpath exports map to `src/*.ts`.
- **Formatting** is Prettier; lint-staged + husky run it on commit. Don't hand-format against it.
- **Comments & docs describe the final design**, not the path to it. Don't narrate approaches tried and discarded _within the change_ — the squash erases that churn, so it's just clutter. Contrasting with behavior the change supersedes (that predates it) is fine.

## Config is repo-kit–managed — do not hand-edit generated files

Per-package config is **generated/synced** by `@twin-digital/repo-kit` from the root **`.repo-kit.yml`**: `eslint.config.js`, `tsconfig*.json`, `package.json` scripts/engines/devDependencies, `.nvmrc`, `tsdown.config.ts`, and the README package list. These are not the source of truth.

To change config across packages, **edit `.repo-kit.yml` (or the shared `devtools/*` config package) and run `pnpm sync`** (`repo-kit sync`); `pnpm update-readme` regenerates the README list. Editing a generated file directly will be overwritten on the next sync. Per-package opt-outs live in `.repo-kit.yml` under `packages.<name>.rules`.

To add a package: create `nodejs/<group>/<name>` with a `package.json` (`name`, `description`, `type: module`, `exports`), then `pnpm install && pnpm sync` to apply shared config.

## Deployment & CI/CD

- **Serverless apps** (e.g. `bookify-render-api`) use the **Serverless Framework** (`serverless.yml`): `pnpm deploy` / `deploy:dev` / `deploy:prod`, `destroy`, `logs`, `invoke`. Local dev uses `serverless-dev-tools` (`sls-dev-tools generate`) piped into a Docker dev container. Container images build via `pnpm artifact` (turbo `artifact` task → `.out/`).
- **CI/CD** is GitHub Actions (`.github/workflows/`): `ci.yaml` runs build→lint→test on every push; on a successful CI run against `main`, `deploy.yaml` and `publish.yaml` fire via `workflow_run`. PRs against `main` get ephemeral **preview** stages (`pr-<number>`), torn down by `destroy-preview.yml`; `merge-checks.yaml` enforces that the README and repo-kit config are in sync. Deploys assume AWS via OIDC. Full details: `docs/CICD.md`.
- **Versioning/publishing** uses **changesets**. A changeset is **required for every change to project code** — any edit under a package's `src/` (or that otherwise affects a published package) must include a changeset (`pnpm exec changeset`) selecting the affected packages and bump type. **Select every impacted package, including private/unpublished ones** (apps, bots, internal tooling): the changeset config sets `privatePackages.version: true`, so private packages are versioned and tagged too — a dependency bump or shared-config change that touches them belongs in the changeset just like a published library. The publish workflow opens/merges the "Version Packages" PR and publishes. For changes that touch **no** package (CI/CD, docs, repo tooling), add an empty changeset (`pnpm exec changeset --empty`) so every change is accounted for.
