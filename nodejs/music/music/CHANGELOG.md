# @thrashplay/music

## 0.3.4

### Patch Changes

- 06767d5: music-audio-probe accepts stream configuration overrides, for isolating a
  sample-rate or buffering mismatch with the output device: PROBE_SAMPLE_RATE
  opens the stream at an explicit rate and PROBE_LATENCY takes 'interactive',
  'balanced', 'playback', or a number of seconds. The requested configuration is
  printed before the stream opens, and the resulting rate after.
- 727edd4: The audio output stream opens at MUSIC_SAMPLE_RATE, defaulting to 44100. The
  rate matters far beyond audio quality: a stream whose rate disagrees with the
  output device's drifts against it, and on at least the FP-30X's USB audio
  interface the reconciliation ~90 seconds in wedges the device for every
  process using it. The default is that device's native rate; set the variable
  to match whatever the samples play through.
- a175a95: MUSIC_SAMPLE_VOLUME (0-1, default 1) scales every sample voice, on top of the
  per-note velocity and channel level. The samples share an output with the
  piano and can need taming relative to it.

## 0.3.3

### Patch Changes

- c09552d: Add music-audio-probe, a standalone diagnostic for the timed audio death under
  investigation in #254: it opens an output stream with no MIDI or samples
  involved, beeps through it every five seconds, and prints the stream's clock
  rate, state, and render load — so the failure can be heard and measured at the
  same moment. A second stream joins at 100 seconds and alternates beeps with
  the first, answering whether a fresh stream survives the first one's death.

## 0.3.2

### Patch Changes

- 7750fd0: Detect a wedged audio stream by its clock, not just its state. A stream whose
  device has stopped invoking its render callbacks renders nothing and freezes
  its clock, but its state can still read 'running' — state is control-side
  bookkeeping, not device truth — so the stall detection added in 0.3.1 never saw
  it. When wall time advances and the context's currentTime does not keep pace,
  the stream is discarded and the next note opens a fresh one, the same recovery
  path a non-running state takes.

  MUSIC_AUDIO_DEBUG=1 turns on audio diagnostics: the render thread reports its
  own load and underrun ratio once a second, and a health line (context state,
  clock, live voices, heap and native memory) prints every five — so a failing
  stream can be watched degrading instead of only found dead. MUSIC_AUDIO_FORCE_GC=1
  (with node --expose-gc) additionally forces a collection pass on every health
  tick, to test whether the render graph grows only because V8 defers collecting
  the small wrapper objects that pin native nodes.

## 0.3.1

### Patch Changes

- 805edda: Field fixes from the first hardware session with sound boards.

  The sound picker turns the piano's Local Control off while it runs (and restores
  it on shutdown), so the keyboard stops sounding its own keys: every key press is
  re-voiced through the app — as an echoed program or a sample — and the piano's
  factory tone underneath doubles every note, most audibly as a piano note under
  each sound-board sample.

  Sample playback no longer stalls after a minute or two of sustained playing.
  Voice cleanup listened for each source's 'ended' event, and registering any
  listener on a source keeps its node alive in node-web-audio-api's render graph
  forever (ircam-ismm/node-web-audio-api#168) — so the graph grew with every note
  until the render thread starved the output device, silencing every process
  using it (speech synthesis included) for the rest of the session.
  Voices are now torn down by a timer derived from the buffer's own duration, and
  no listener is ever registered on a source. Concurrent voices are also capped
  at 32 (stealing the oldest), and the player logs when the audio context leaves
  the running state and when it recovers, so a stalled stream is visible in the
  log rather than presenting as silent dead keys.

  Audio failures now heal within the session instead of requiring a restart: a
  stream that stays stalled for ten seconds is discarded and reopened fresh on
  the next note, and an output device that refuses to open is retried after
  thirty seconds rather than latching the player silent for the rest of the
  session.

  Speech volume is tunable via MUSIC_SPEECH_VOLUME (0-1) and defaults to 0.5:
  announcements share an output with the instruments and should not drown them
  out.

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
