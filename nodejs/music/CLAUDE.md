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
  (buttons/faders/groups/translate), sample playback (`src/audio/`), and the game programs under
  `src/app/`.
- `launchpad-sim` (`@thrashplay/launchpad-sim`) — browser-based hardware stand-in: a Vite app that
  renders the Launchpad grid on a canvas and an on-screen piano (Web MIDI + soundfont-player), so
  programs can be developed without the physical devices.

## Running it

- Against hardware: `pnpm --filter @thrashplay/music dev` (requires the Launchpad and a MIDI piano
  connected; device names are matched in `src/index.ts`).
- In the browser: `pnpm --filter @thrashplay/launchpad-sim dev`, then open the printed URL.
- In the studio (no monorepo checkout): `npx @thrashplay/music@latest` — the package is published
  to npm with a `music` bin; deploying is merging a PR and re-running that command.
- Sound-board samples, once per machine: `npx -p @thrashplay/music music-fetch-samples` (or
  `pnpm --filter @thrashplay/music exec music-fetch-samples` in the monorepo). Without it, the
  boards are selectable but silent.

## Sound boards

Most instruments are MIDI patches: a key press is echoed to the piano, and the piano's synth makes
the sound. Sound boards are the exception — the app plays a sample itself and sends the piano
nothing.

They are ordinary `Instrument`s in a bank the app reserves (MSB 126; GM2 uses 120 and 121), which
is why they appear in the picker as a family beside the GM patches with no UI of their own. Nothing
carrying that MSB is ever transmitted: `Channel.selectSound` recognizes it, binds the board, and
returns before the program change. `Channel.playNote` then sounds the mapped sample rather than
echoing. Boards are one-shot, so note-off does nothing, and the mapping wraps across the keyboard.

`SamplePlayer` (`src/audio/`) talks to the Web Audio API — the browser's under the sim,
`node-web-audio-api`'s under Node — so one implementation serves both. Decodes are memoized and
warmed in the background at program start; playback never awaits them, and drops a sample that
isn't ready rather than firing it late.

The samples are Mojang's and are not in the repo or the npm package. `music-fetch-samples`
downloads them from the asset servers the game's own launcher uses, into `~/.thrashplay/samples`
(`MUSIC_SAMPLES_DIR` overrides). The sim serves that same directory at `/samples` via a Vite config
fragment, since it sits outside any checkout.

## Environment variables

| Variable                             | Default                 | Purpose                                                                                                                        |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MUSIC_SAMPLES_DIR`                  | `~/.thrashplay/samples` | Where `music-fetch-samples` downloads and the app reads sound-board samples.                                                   |
| `MUSIC_SAMPLE_RATE`                  | `44100`                 | Rate the audio output stream opens at. Must match the output device's native rate — a mismatch wedges some USB devices (#254). |
| `MUSIC_SPEECH_VOLUME`                | `0.5`                   | Volume of spoken announcements, 0-1.                                                                                           |
| `MUSIC_AUDIO_DEBUG`                  | off                     | Log render-thread load and a health line while playing samples.                                                                |
| `MUSIC_AUDIO_FORCE_GC`               | off                     | Force a GC pass on every health tick (diagnostics).                                                                            |
| `MINECRAFT_VERSION`                  | latest release          | Game version `music-fetch-samples` resolves sample names against.                                                              |
| `PROBE_SAMPLE_RATE`, `PROBE_LATENCY` | library default         | Stream configuration for `music-audio-probe`.                                                                                  |

## Architecture notes

- `music` is isomorphic: the engine, UI kit, and programs run in Node and the browser; only the
  easymidi-backed `MidiDevice` layer is Node-only. The sim swaps in `WebMidiPiano`/`WebRenderer`
  and never executes those paths — Vite stubs the Node builtins it sees in the graph (the
  "externalized for browser compatibility" build warnings are expected). Node-only modules that the
  bundler still has to resolve must import builtins as namespaces (`import * as path`), because a
  named import off Vite's stub is a build error.
- The sim consumes `@thrashplay/music` source-first: `vite.config.ts` adds the `source` export
  condition, matching the monorepo's tsconfig `customConditions` convention.
- The sim's build is the repo's first Vite app: `build: build` (opus-scripts) dispatches to
  `vite build` when a `vite.config.*` is present.
