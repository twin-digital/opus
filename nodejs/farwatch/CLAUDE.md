# farwatch

A family of `@thrashplay/*` packages inside the Opus monorepo: a seed-driven covenant-founding
generator and adventure simulator that can chronicle outcomes through an LLM backend.

## Packages

- `core` — deterministic RNG and shared primitives (`@thrashplay/fw-core`)
- `simulation` — adventure resolution and the simulation loop (`@thrashplay/fw-simulation`)
- `worldgen` — procedural covenant/world generation (`@thrashplay/fw-worldgen`)
- `chronicler` — turns pinned simulation outcomes into narrative via an LLM (`@thrashplay/fw-chronicler`)
- `app` — end-to-end CLI tying it together (`@thrashplay/farwatch`)

## Tooling — identical to the rest of the monorepo

There is **no** farwatch-specific tooling. These packages follow the repo-wide conventions:

- **pnpm + turbo**, driven from the repo root.
- **Generated config.** `package.json` managed fields, `tsconfig.json`, `tsconfig.build.json`,
  `eslint.config.js`, and `vitest.config.ts` are written by `pnpm sync` (repo-kit, see the root
  `.repo-kit.yml`). Don't hand-edit them — change the source of truth and re-run `pnpm sync`.
- **TypeScript** via `@twin-digital/tsconfig` (strict, `nodenext`, `verbatimModuleSyntax`).
  Relative imports use **`.js`** extensions (`import { createRng } from './rng.js'`), which resolve
  to the `.ts` source through the `source` export condition. Cross-package imports use the package
  name (`import { createRng } from '@thrashplay/fw-core'`) — no project references, no pre-build needed
  for typecheck/test.
- **Tests:** vitest (`@twin-digital/vitest-config`), co-located as `src/**/*.test.ts`.
- **Running from source:** apps/CLIs run under `tsx` in dev (bare `node` won't resolve the `.js`
  specifiers back to `.ts`); production runs the built `dist/`.

## Code style (enforced by eslint/prettier from the root)

- Always use braces, even for single-line blocks.
- No semicolons.

## Commands (from the repo root)

| Goal                           | Command                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| Build / test / lint everything | `pnpm build` · `pnpm test` · `pnpm lint`                       |
| Everything for farwatch only   | `pnpm --filter "@thrashplay/*" test`                           |
| One package                    | `pnpm --filter @thrashplay/<name> test`                        |
| Watch a package                | `pnpm --filter @thrashplay/<name> test:watch`                  |
| Run the CLI (built)            | `pnpm --filter @thrashplay/farwatch start [seed]`              |
| Run the CLI (source, dev)      | `pnpm --filter @thrashplay/farwatch dev [seed]`                |
| Generate a founding            | `pnpm --filter @thrashplay/fw-worldgen gen --seed 7 --count 5` |
| Re-generate config after edits | `pnpm sync`                                                    |

The `app` reads an optional `.env` from the farwatch directory (`CHRONICLER_LLM`, AWS creds, etc.)
before selecting an LLM backend; `selectLlm()` throws if `CHRONICLER_LLM` is unset.
