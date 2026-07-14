# @thrashplay/music

## 0.3.0

### Minor Changes

- 2d84e2f: Add sound-board instruments: keys mapped to audio samples, played by the app itself.

  Sound boards are ordinary instruments in a bank the app reserves for itself (MSB 126), so they sit
  alongside the GM patches and drum kits in the picker and need no separate screen. The bank is an
  internal marker rather than something the piano ever sees: selecting a board binds it to the
  channel and sends no program change, and a note on that channel sounds its mapped sample instead of
  being echoed to the piano. Boards are one-shot — a sample runs to completion, so note-off does
  nothing — and the key mapping wraps, so every key on an 88-key piano triggers something.

  This is the first audio the package produces on its own. `SamplePlayer` drives the Web Audio API,
  backed by the browser's implementation in the sim and `node-web-audio-api` under Node, so the same
  playback code runs in both. Samples are decoded once, memoized, and warmed in the background when
  the sound picker starts, so a key press never waits on I/O; a sample that somehow isn't ready is
  dropped rather than played late.

  Ships with three Minecraft boards (Mobs, Blocks and Items, Adventure). The audio is Mojang's and is
  not redistributed here: the new `music-fetch-samples` command downloads it from the same asset
  servers the game's own launcher uses, into `~/.thrashplay/samples` (override with
  `MUSIC_SAMPLES_DIR`). Run it once before selecting a board.

### Patch Changes

- 5074278: Fix the sound picker's initial instrument selection never reaching the piano, and give channels an
  identity that does not depend on MIDI.

  `Channel.id` returned the channel's MIDI channel number, so the first channel's id was 3 rather
  than 0 — the MIDI channels backing the controller are neither zero-based nor contiguous, since 9 is
  skipped as the General MIDI percussion channel. The picker's setup addressed channels by their
  position in the channel list, which meant `channelById` matched nothing: the opening program change
  was silently dropped, and the selected family and instrument were recorded under a key that nothing
  ever read.

  A channel's id is now its position in the channel list, which is what the UI already assumed and
  what `ChannelState` — the view model the grid components consume — was always shaped for. The MIDI
  channel stays inside `Channel`, as the transport detail it is, and is no longer part of the view
  model, which nothing was reading anyway. This also lets a channel exist without a meaningful MIDI
  channel at all.

  `ChannelId` is branded, so the confusion that caused the bug is now a compile error rather than a
  silent mismatch: a raw number, such as an array index, can no longer be passed where a channel id
  is expected. Channel logs carry both numbers (`[CHANNEL#0 midi=3]`), since the MIDI channel is
  still what appears on the wire.

## 0.2.1

### Patch Changes

- 5cc2f92: Fix the ear-training games never starting: the engine ticks the program every frame from the
  moment it's entered, but the state machine's initialization is deferred behind the spoken game
  announcement — and an uninitialized machine still advanced through its un-entered initial state
  into `play-challenge` holding the placeholder NullChallenge, whose empty sequence never
  completes. The game wedged permanently: no challenge notes, and key presses were ignored
  because `wait-for-response` was never reached. `StateMachine.update()` is now a no-op until
  `initialize()` runs (and `shutdown()` is a no-op on a never-initialized machine).

## 0.2.0

### Minor Changes

- 82e3db5: Add the Play My Note game and in-screen game selection to Musical Exercise. Games live in a
  registry (`games.ts`) with a name, identity color, and challenge factory; the right-edge column
  lights one pad per game (identity color, green when active), pressing one abandons the current
  challenge — including its queued audio — announces the game name via text-to-speech, and starts
  the new game once the announcement finishes. The active game's identity color also lights the
  playfield's four corners, recomposed every frame so feedback effects can't permanently cover
  them.

  Play My Note (the default game) wires up the existing `SingleNoteEarTraining` challenge: one
  note plays (drawn from the natural notes of the octave starting at middle C), and only the exact
  matching pitch is correct. Wrong answers get spoken feedback naming the played note and pointing
  at the target — "C. My note is higher!" — via a new `getVerbalFeedback` hook on challenges: the
  state machine records the last response, snapshots the phrase at judgment time, and gates the
  next round on both the feedback audio and the speech finishing.

- 4d674ac: Import the music project (Launchpad Mini Mk3 music-learning games) as `nodejs/music`:
  `@thrashplay/music` (MIDI device layer, Launchpad driver, program engine, and game programs) and
  `@thrashplay/launchpad-sim` (browser-based hardware simulator). `@thrashplay/music` is published
  with a `music` bin, so the studio machine runs it via `npx @thrashplay/music@latest` instead of
  checking out the monorepo. opus-scripts gains a vite builder: `build` dispatches to `vite build`
  for packages with a `vite.config.*`, ahead of the tsc fallback.
- f3c5767: Sound picker: drum kits are selectable as a third family row, and oversized families use a packed layout.

  - The family selector spans three rows (screen rows 7–5), with Drum Kit in the 17th slot; the instrument area shrinks to five rows (4–0).
  - Drum Kit and Sound Effect instruments are packed in data order (left-to-right, filling rows downward) instead of being positioned by patch column and bank-LSB row, which had scattered sparse drum-kit patches off-grid and made the deepest four Sound Effect rows unreachable. Train, Jetplane, and Starship are reachable for the first time; Burst Noise is dropped to fit the 40-slot area.
  - Sound selection sends the instrument's bank MSB (120 for drum kits) before the program change instead of hardcoding the GM2 melodic bank (121).

### Patch Changes

- ffbc886: Fix the unbounded memory leak that crashed the app after days of uptime. `MidiDeviceWatcher`
  now enumerates ports through a single long-lived `@julusian/midi` client pair instead of
  `easymidi.getInputs()/getOutputs()`, which leak a pinned native MIDI client on every call
  (dinchak/node-easymidi#51) — at the watcher's polling rate, enough to exhaust the heap in a
  handful of days. Numbered-name deduplication is preserved so watcher names keep matching the
  easymidi device constructors. Also slows the default poll from 100ms to 500ms and unregisters
  `getFirmwareVersion`'s identity-response listener on the success path.
