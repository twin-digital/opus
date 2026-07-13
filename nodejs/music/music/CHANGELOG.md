# @thrashplay/music

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
