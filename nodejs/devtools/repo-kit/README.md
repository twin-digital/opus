---
summary: CLI that keeps per-package config across the monorepo in sync with a single declarative source of truth.
---

# @twin-digital/repo-kit

`repo-kit` is the monorepo's configuration manager. Instead of hand-maintaining `package.json` scripts,
`tsconfig.json`, `eslint.config.js`, exports maps, and friends in every package — and watching them drift as
conventions evolve — you describe the conventions **once** in a root [`.repo-kit.yml`](../../../.repo-kit.yml) and
let `repo-kit sync` apply them to every package, idempotently.

It is a small, repo-shaped tool: a generic, declarative engine (`features → actions → conditions`) whose only
opinions live in `.repo-kit.yml`, not in the code. Drift is caught in CI by
[`merge-checks.yaml`](../../../.github/workflows/merge-checks.yaml), which fails any PR where re-running `sync` or
`update-readme` would produce a diff.

## Commands

The package publishes a single `repo-kit` bin. Both commands are wired into root scripts:

| Command                  | Root script          | What it does                                                                                                                        |
| ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `repo-kit sync`          | `pnpm sync`          | Walks every workspace package and applies the configured features (writing/patching files, then running any matching hooks).        |
| `repo-kit update-readme` | `pnpm update-readme` | Regenerates the package table in the root `README.md` between the `<!-- BEGIN repo-kit: PACKAGES -->` / `<!-- END ... -->` markers. |

```bash
pnpm sync                       # apply config to all packages
pnpm sync --config path.yml     # use a non-default config file
pnpm update-readme              # refresh the package list in README.md
```

`update-readme` sources each package's description from, in order: its `README.md` front-matter `summary`, its
`package.json` `description`, then the first non-heading paragraph of its `README.md`.

## How it works

`sync` loads `.repo-kit.yml`, discovers packages via `pnpm list -r`, and for each package evaluates the configured
**features**. The model has three layers:

- **Feature** — a named unit of configuration (e.g. `typescript`, `eslint`, `test`). May carry conditions; if they
  pass, its actions run.
- **Action** — a single file mutation. Three kinds:
  - `write-file` — write a fixed file body (idempotent; skipped if byte-identical).
  - `json-merge-patch` — RFC 7396 merge into a JSON file (patch authored in YAML).
  - `json-patch` — RFC 6902 plus the custom ops from [`@twin-digital/json-patch-x`](../json-patch-x)
    (`appendIfMissing`, `removeValue`, `reorderMapKeys`).
  - After any JSON patch, empty objects/arrays/`undefined` are pruned and keys re-serialized so diffs are stable.
- **Condition** — a predicate gating a feature or an individual action:
  - `exists` / `notExists` — a glob matches (or doesn't) within the package.
  - `dependency` — the package declares a given dependency (dep/dev/peer matched by default; optional opt-in).

When a feature or action lists **multiple conditions, they are combined with logical AND** — all must pass for it to
apply.

After a package's files change, any **hooks** whose `path` glob matches a changed file run (e.g. `pnpm install`,
`prettier-package-json --write`). Hooks execute a shell command in the package directory, so only use trusted config.

### Per-package opt-outs

Every feature is on by default. Disable one for a specific package under `packages.<name>.rules` in `.repo-kit.yml`:

```yaml
packages:
  '@twin-digital/tsconfig':
    rules:
      typescript: false # this package bootstraps the tsconfig, so don't manage its own
```

## Editing the config

To change a convention across the repo, **edit `.repo-kit.yml` (or the shared `devtools/*` config package it points
at) and run `pnpm sync`** — never hand-edit a generated file, as the next sync overwrites it. To add a feature, append
an entry under `features:` with its conditions and actions.

A trimmed example:

```yaml
features:
  - name: test
    actions:
      - name: Add dependencies
        action: json-merge-patch
        conditions:
          - exists: src/**/*.test.ts
        options:
          file: package.json
          patch: |
            devDependencies:
              vitest: 'catalog:'
            scripts:
              test: vitest run
      - name: Create vitest config
        action: write-file
        conditions:
          - exists: src/**/*.test.ts
        options:
          file: vitest.config.ts
          content: |
            import { sharedConfig } from '@twin-digital/vitest-config'
            export default sharedConfig
```

## Development

```bash
pnpm build --filter @twin-digital/repo-kit
pnpm test  --filter @twin-digital/repo-kit
```

The engine (actions, conditions, the rule factory, and the markdown/JSON utilities) is covered by colocated
`*.test.ts` unit tests. `repo-kit` is dogfooded: its own `package.json`, `tsconfig*.json`, `eslint.config.js`, and
`vitest.config.ts` are all generated by running `pnpm sync` against this repo.
