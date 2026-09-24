# @thrashplay/music

## 0.10.0

### Minor Changes

- 648c569: Studio touch page: an album view behind the album name, showing the open project as a tile with its song count and first date, and a name of its own that he can set from there (kept in the clip library, carried by the manifest). Making and switching albums is previewed as a disabled tile; the REAPER side is unchanged apart from recording the name.

### Patch Changes

- 46e2005: Producer import: runs as a background job, copying stems a chunk at a time between REAPER timer ticks, so REAPER stays responsive during a large import; progress per clip in the console, one undo step per clip.

## 0.9.0

### Minor Changes

- d0fc487: Studio touch page: the clip list has a name search, a deleted filter, day headings, a star and a trash can per card (one tap; the recording stays in REAPER and the deleted view brings it back), and unnamed clips sit back a little. Star and delete reach the watcher as flags and live in the library and manifest; the producer import skips deleted clips. The list takes about 70% of the width.

### Patch Changes

- 9e448b4: Studio watcher: a take in which nothing was detected (no input activity, every recorded file scanned silent) is discarded rather than kept as an "(empty)" clip; `keep_empty_takes = true` restores the old behaviour. Routine events (auto-stops, untrimmed takes, a stop with no items) no longer open REAPER's console, which stole the screen from the touch page; only real problems do.

## 0.8.4

### Patch Changes

- de70b58: Studio: REAPER counts as unreachable after two seconds without an answer rather than after three polls, so a render or a save no longer flashes the offline overlay; a stop at a take's end that went astray is retried every 250 ms with one warning, so it lands well inside the gap before the next take; `localhost` in MUSIC_REAPER_URL is sent as 127.0.0.1.
- ccf3cc1: Studio watcher: a clip whose library entry has no source files (from before the library, or a region made by hand) gets them from the items under its region, so the producer import has its stems.

## 0.8.3

### Patch Changes

- 994d883: Studio watcher: only one copy runs (a later start supersedes an earlier one), and a failure right after a take's region is made can no longer make the region a second time.

## 0.8.2

### Patch Changes

- dcb18d4: Studio: the page's track meters show playback. REAPER meters an armed track from its input, so the watcher publishes each track's playback level from its items at the play position, and each meter shows the louder of input and playback.

## 0.8.1

### Patch Changes

- 8ec8269: Studio: a take that was just started is kept while REAPER still reports the cursor's old position, and the stop at a take's end is sent again if it went astray, so playback shows on the page and stops at the take's end again.

## 0.8.0

### Minor Changes

- fb2c619: Studio touch page visuals: a strip under the header shows the playing clip's waveform (wavesurfer.js over the clip's Outbox mix, served at `/clips/<id>.wav`) with a cursor that follows REAPER and seeks on tap, a live level graph while recording, and per-track meters with peak hold whenever the transport moves. The service polls every 50 ms while playing or recording and exposes per-track levels and the position within the playing clip; `playTake` accepts an offset. The on-screen keyboard is half width, centered. `MUSIC_STUDIO_OUTBOX` points the app at the watcher's Outbox. The watcher renders clips up to `render_now_seconds` (3 min) the moment they end, so their waveforms appear almost at once, and renders under a temporary name that is renamed into place, so a mix in the Outbox is always whole.

## 0.7.0

### Minor Changes

- d0c3e59: The Outbox is one folder per project, and each clip's files are named `<YYYYMMDD> - <0012> - <name>` (recording date, padded clip number, given name or "Clip 12"), with `manifest.json` in the project's folder.

  The package's `reaper/` folder splits into `studio/` (the watcher, installed by the app) and `producer/`: `cs-studio-import.lua` blesses clips into the open REAPER project on the review machine: every clip named in the studio, at least `min_seconds` long, and not imported before (recorded in the project), as one muted folder track at time zero with the stems copied into the project's media folder and the MIDI rebuilt from the Outbox file; `cs-studio-import-watch.lua` does the same continuously, with `install-producer.ps1` to install it and write its config. The manifest gains the project folder name and each source item's start time.

## 0.6.0

### Minor Changes

- 1524da7: The studio app ships and installs its REAPER watcher: on start it writes `cs-studio-watcher.lua`, a user-owned `cs-studio-config.lua`, and the startup hook into REAPER's resource path, asks a running watcher of a different version to reload itself, and refuses to start when REAPER is not running the shipped file (`--ignore-helper-mismatch` downgrades that to a warning and a banner on the touch page). The watcher's settings move to `cs-studio-config.lua`. The `reaper/` folder moves into the package.
- 0d5b32d: The studio watcher keeps a clip library (`cs-studio-library.json` beside the project: number, label, bounds, how the take ended, source files, render record) and fills an Outbox while the studio is idle: a rendered mix and a MIDI file per clip, and a manifest. Renames move the files, trims re-render, deletions remove them. The app tolerates the short stall a render causes instead of flagging REAPER offline.

## 0.5.1

### Patch Changes

- 3c19696: The studio watcher now finds rename requests written through REAPER's web remote (which upper-cases ext-state keys), reports its version and errors on the ReaScript console, and uses wall-clock time. `music-studio-preview` drives a real REAPER when `MUSIC_REAPER_URL` is set. Adds `reaper-probe.mjs` / `.ps1`, dependency-free checks of the REAPER web remote and the watcher round trip.
- 550ff5d: The studio touch page lists every clip instead of the newest twelve.

## 0.5.0

### Minor Changes

- 9b413e9: Add the recording studio: a REAPER web-remote client, a polling `StudioService` that owns transport state, the list of recorded takes (project regions), and record / stop / play-take actions, a two-pad Launchpad transport overlay (record, play my last one) drawn above every program, and a touchscreen page (record, stop, recent takes, level) served on `MUSIC_STUDIO_PORT` with state streamed over server-sent events. `createLauncher` accepts persistent `overlays`; `createLauncherProgram` takes a `studio` service and adds the transport. Enabled by `MUSIC_REAPER_URL`. For capture, `MUSIC_MIDI_MIRROR` mirrors everything sent to the piano to a second MIDI port and `MUSIC_SAMPLE_OUTPUT` picks the audio device sound-board samples play through; the CLI restores the piano's Local Control on exit. The page shows the sounding instrument and the project name, records with a single toggling button, plays clips by tapping them, and names clips through an on-screen keyboard (simple-keyboard) with the watcher renaming the region; `music-studio-preview` runs the page against a simulated studio.

## 0.4.3

### Patch Changes

- c16c3e3: The sound picker no longer speaks the instrument name when an instrument is selected. Side and split announcements are unchanged.

## 0.4.2

### Patch Changes

- 4a44349: fix(deps): update dependency pino to v10

## 0.4.1

### Patch Changes

- da1e483: Regenerate the managed eslint and vite config files to call the shared config packages' compose helpers (`defineProjectConfig` / `defineAppConfig`) instead of inlining the composition. No behavior change.

## 0.4.0

### Minor Changes

- dd23976: Split keyboard: two zones with a fixed split point at C4, each playing its own instrument.

  The split toggle sits at the top of the sound picker's side column. Turning it on keeps the current
  sound in the right hand and puts the GM standard drum kit in the left — B3 keeps the entire GM
  standard drum map in reach of the left hand — with the left hand taking the selection, ready for a
  kit change; both hands start unmuted at the volume the whole keyboard had. Turning it off collapses
  the keyboard to the currently selected side's sound. The side pads below the toggle select which hand the picker edits, ordered
  bottom-up to match low-to-high on the piano, and the levels screen orders its fader rows the same
  way so each side pad labels its own fader row.

  A side wears the family color of its selected instrument, and motion carries split state: with
  split on the selected side breathes, the unselected side holds steady, and the toggle cycles left
  color → black → right color → black; with split off everything holds steady. Side selection and
  the toggle announce themselves ("left hand" / "right hand", "two instruments" / "one instrument");
  all spoken feedback shares one `speech` option (previously `speakInstrumentNames`, which now gated
  more than names).

  Routing lives in `LaunchpadController` as a keyboard route table — `{ key range → channel }`
  entries applied to incoming keyboard notes, with whole-keyboard play expressed as a single
  full-range route. `Channel` remains a pure mixer strip and plays whatever it is told, so
  programmatically fed notes are never range-filtered.

  The launcher exposes a program to the render loop only between `initialize()` and `shutdown()`,
  so a program switch no longer draws or updates a program that has not finished initializing.

### Patch Changes

- 1e276e0: audify is an optional peer dependency instead of a runtime dependency, so the
  default install — including every npx invocation — no longer downloads its
  native binding. Only the probe's opt-in rtaudio backend uses it; selecting
  PROBE_BACKEND=rtaudio without the package present prints the exact command to
  supply it (npx -y -p @thrashplay/music@latest -p audify music-audio-probe).
- f7cac66: MUSIC_AUDIO_FORCE_GC no longer needs node started with --expose-gc. Node
  refuses that flag in NODE_OPTIONS and npx offers no way to pass it to the
  binary, so when gc() is not already exposed the player enables the flag at
  runtime via v8.setFlagsFromString and picks up the function from a throwaway
  VM context. Setting the two environment variables is now the whole setup:

      MUSIC_AUDIO_DEBUG=1 MUSIC_AUDIO_FORCE_GC=1 npx @thrashplay/music@latest

- c7ae5ba: MUSIC_AUDIO_FORCE_GC is removed. It existed to test whether the render graph
  grew because V8 deferred collecting the wrappers that pin native nodes — a
  theory the investigation on #254 falsified (a single note reproduced the
  stall; the cause was degraded machine state cleared by a reboot). The
  MUSIC_SAMPLE_RATE documentation also stops attributing the device wedge to
  rate mismatch, which the same investigation disproved; the setting remains as
  resampling hygiene.

## 0.3.5

### Patch Changes

- 0d55816: music-audio-probe gains a second audio backend: PROBE_BACKEND=rtaudio drives
  the beeps through audify's RtAudio bindings — an independent CoreAudio path
  sharing no code with the cpal backend under node-web-audio-api. If the rtaudio
  backend survives where the webaudio backend dies at ~90 seconds, the fault is
  in cpal's layer and RtAudio is a viable escape hatch for sample playback; if
  both die alike, the fault is below every library. The rtaudio backend also
  prints the device's preferred and supported sample rates as RtAudio sees them.

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
