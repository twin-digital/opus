# music (`@thrashplay/*`)

Music-learning games for the Novation Launchpad Mini Mk3: the Launchpad is both screen and
controller (an 8×8 RGB pad grid), a MIDI piano is the instrument, and programs are small games —
ear-training exercises with call-and-response challenges, a sound picker for browsing GM
instruments, etc. Repo-wide conventions (pnpm/turbo, repo-kit-generated config, strict ESM/NodeNext
with `.js` specifiers, changesets) all apply — see the root `CLAUDE.md`; only music-specific bits
live here.

## Packages

- `music` (`@thrashplay/music`) — the whole game stack: MIDI device layer (easymidi) with
  hot-plug watching, the Launchpad Mini Mk3 driver (sysex commands, LED rendering, input mapping),
  a small program engine (main loop, entities, state machines), a grid UI kit
  (buttons/faders/groups/translate), and the game programs under `src/app/`.
- `launchpad-sim` (`@thrashplay/launchpad-sim`) — browser-based hardware stand-in: a Vite app that
  renders the Launchpad grid on a canvas and an on-screen piano (Web MIDI + soundfont-player), so
  programs can be developed without the physical devices.

## Running it

- Against hardware: `pnpm --filter @thrashplay/music dev` (requires the Launchpad and a MIDI piano
  connected; device names are matched in `src/index.ts`).
- In the browser: `pnpm --filter @thrashplay/launchpad-sim dev`, then open the printed URL.
- In the studio (no monorepo checkout): `npx @thrashplay/music@latest` — the package is published
  to npm with a `music` bin; deploying is merging a PR and re-running that command.

## Architecture notes

- `music` is isomorphic: the engine, UI kit, and programs run in Node and the browser; only the
  easymidi-backed `MidiDevice` layer is Node-only. The sim swaps in `WebMidiPiano`/`WebRenderer`
  and never executes those paths — Vite stubs the Node builtins it sees in the graph (the
  "externalized for browser compatibility" build warnings are expected).
- The sim consumes `@thrashplay/music` source-first: `vite.config.ts` adds the `source` export
  condition, matching the monorepo's tsconfig `customConditions` convention.
- The sim's build is the repo's first Vite app: `build: build` (opus-scripts) dispatches to
  `vite build` when a `vite.config.*` is present.
