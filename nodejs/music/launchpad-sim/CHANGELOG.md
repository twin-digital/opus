# @thrashplay/launchpad-sim

## 0.2.0

### Minor Changes

- 4d674ac: Import the music project (Launchpad Mini Mk3 music-learning games) as `nodejs/music`:
  `@thrashplay/music` (MIDI device layer, Launchpad driver, program engine, and game programs) and
  `@thrashplay/launchpad-sim` (browser-based hardware simulator). `@thrashplay/music` is published
  with a `music` bin, so the studio machine runs it via `npx @thrashplay/music@latest` instead of
  checking out the monorepo. opus-scripts gains a vite builder: `build` dispatches to `vite build`
  for packages with a `vite.config.*`, ahead of the tsc fallback.

### Patch Changes

- 4d674ac: Add first-class Vite support to the shared config. `@twin-digital/tsconfig` gains
  `tsconfig.vite.json` (browser/bundler-mode: module preserve, bundler resolution, DOM libs,
  vite/client types), and the repo-kit `vite` feature — keyed on the `vite` dependency — generates a
  tsconfig extending it, the `dev`/`preview` scripts, and a `vite.config.ts` fragment loader:
  per-app settings live in `vite.config.d/*.js` (the same override pattern as `eslint.config.d`),
  with the source-first `resolve.conditions` baked into the base. launchpad-sim migrates onto the
  generated config.
- Updated dependencies [ffbc886]
- Updated dependencies [82e3db5]
- Updated dependencies [4d674ac]
- Updated dependencies [f3c5767]
  - @thrashplay/music@0.2.0
