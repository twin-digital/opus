---
'@twin-digital/grinbox-cli': minor
'@twin-digital/grinbox-server': minor
'@twin-digital/grinbox-shared': minor
'@twin-digital/grinbox-web': minor
'@twin-digital/opus-scripts': minor
'@twin-digital/eslint-config': minor
'@twin-digital/refbash': patch
'@twin-digital/bookify-render-api': patch
---

Migrate the Grinbox application into the monorepo as `nodejs/grinbox/{shared,server,cli,web}`.

- Grinbox packages adopt monorepo standards: repo-kit–managed config, eslint
  (replacing biome), catalog dependencies (including zod 4 and vitest 4), and
  source-first exports.
- `@twin-digital/opus-scripts` gains a vite build strategy: a package with a
  `vite.config.*` builds via `vite build` (used by `grinbox-web`).
- `@twin-digital/eslint-config` relaxes additional rules in test files
  (`no-unsafe-call`/`member-access`/`return`, `require-await`,
  `no-empty-function`) — async mocks and `any`-producing test doubles are
  idiomatic in tests.
- `react`, `react-dom`, `@types/react`, `@testing-library/react`, `vite`, and
  `hono` move to the pnpm catalog; `refbash` and `bookify-render-api` now
  consume them via `catalog:`.
