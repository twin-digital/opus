# farwatch (`@thrashplay/*`)

Farwatch is a single-player, text-only game: you are a mostly-absent **patron** who governs an
inherited **compact of seekers** by standing edict rather than direct control, then returns to read
the **saga** of what happened while you were gone — quests won or lost, seekers risen or permanently
dead, your laws faithfully kept or comprehensibly defied by people with their own wills. The deep
verb is _comprehension_: working out an opaque-but-fair simulation from fallible testimony. (Working
title — see Design.)

What's actually built is a thin slice of that: a seed-driven compact generator + adventure simulator
that chronicles outcomes through an LLM. Repo-wide conventions (pnpm/turbo, repo-kit-generated config,
strict ESM/NodeNext + `.js` specifiers, vitest, changesets) all apply — see the root `CLAUDE.md`; only
farwatch-specific bits live here.

## Design — read before building

**The docs run far ahead of the code. The code is an early end-to-end spike, not the spec** — build
_toward_ the docs; don't assume the packages reflect them. The vision lives in `docs/farwatch/`:

- `target-saga.md` — **start here for the _feel_.** A hand-authored target saga (the reading we want
  the game to produce) reverse-engineered into the _minimum substrate_ it demands. Surface-first; it
  argues the genome can start tiny and grow only where a future reading needs more.
- `glossary.md` — **the canonical vocabulary / north star.** The one place each concept's name and
  meaning is fixed (Adventure → Trial → Check, Obstacle, Course of action, Edict, …). When a task
  says "implement the Adventure system," this defines what that means — use these exact terms.
- `design-deep.md` / `design.md` — the full design at **two intentional levels of detail**:
  `design-deep` is the complete v0.1 doc (the 11 systems, pinned open questions, reading list, build
  sequencing); `design` is the condensed pass over the same vision. Reach for the depth you need.
- `resolution-mechanics.md` — an older resolution sketch; its `Option` model now lives in
  `glossary.md` (which also retires the term _"encounter"_). Treat the glossary as authoritative where
  they overlap. Stub with open TBDs.

## Packages

- `core` (`@thrashplay/fw-core`) — deterministic RNG and shared primitives
- `simulation` (`@thrashplay/fw-simulation`) — adventure resolution and the simulation loop
- `worldgen` (`@thrashplay/fw-worldgen`) — procedural compact/world generation
- `chronicler` (`@thrashplay/fw-chronicler`) — pinned simulation outcomes → narrative via an LLM.
  Authoring/extending the prompt builder, snippets, pipelines, and inspector UI: see
  `chronicler/README.md` (recipes) and the **Chronicler implementation** section of
  `docs/farwatch/glossary.md` (vocabulary).
- `app` (`@thrashplay/farwatch`) — end-to-end CLI tying it together

## Running it

- Whole family at once: `pnpm --filter "@thrashplay/*" <test|build|lint>`
- CLI: `pnpm --filter @thrashplay/farwatch dev [seed]` (source, default seed `1`) or
  `start [seed]` (built). Pinned sim facts go to stderr, the generated story to stdout.
- Generate a founding without the LLM: `pnpm --filter @thrashplay/fw-worldgen gen --seed 7 --count 5`
  (omit `--seed` for a random-but-printed seed).

## LLM backend

`app/src/main.ts` loads an optional `.env` from the **monorepo root** (`CHRONICLER_LLM`, `AWS_*`, …)
before selecting a backend. `selectLlm()` has no default and is called first so it **fails fast** —
it throws if `CHRONICLER_LLM` is unset.
