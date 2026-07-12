---
'@twin-digital/tsconfig': minor
'@thrashplay/launchpad-sim': patch
---

Add first-class Vite support to the shared config. `@twin-digital/tsconfig` gains
`tsconfig.vite.json` (browser/bundler-mode: module preserve, bundler resolution, DOM libs,
vite/client types), and the repo-kit `vite` feature — keyed on the `vite` dependency — generates a
tsconfig extending it, the `dev`/`preview` scripts, and a `vite.config.ts` fragment loader:
per-app settings live in `vite.config.d/*.js` (the same override pattern as `eslint.config.d`),
with the source-first `resolve.conditions` baked into the base. launchpad-sim migrates onto the
generated config.
