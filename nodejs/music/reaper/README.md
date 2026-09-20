# REAPER studio setup

The REAPER side of the piano recording corner. The touch page and the Launchpad
transport live in `@thrashplay/music`; this folder holds the ReaScript that runs inside
REAPER and the setup notes for the Mac. Every recording lands as a new item in a normal REAPER
project, wrapped in a named "Take N" region, and the project auto-saves.

```
Touchscreen (browser)  ──▶  @thrashplay/music (Node)  ──HTTP──▶  REAPER web interface (8080)
Launchpad pads         ──▶        StudioService                        │
                                                        kidstudio_watcher.lua (background)
                                                        names, trims, saves each take
```

## Hardware wiring

Recommended: piano over USB (audio + MIDI), mic through the Scarlett.

- FP-30X `USB Computer` port -> MacBook. The FP-30X is class-compliant and
  sends stereo audio and MIDI over one cable.
- SM58 -> Scarlett 2i2 input 1 (XLR, gain up, no 48V needed).
- Scarlett monitor outs -> speakers, or headphones in the Scarlett jack.
- macOS: Audio MIDI Setup -> `+` -> Create Aggregate Device. Check the Scarlett
  and the FP-30X, enable Drift Correction on the FP-30X, set the Scarlett as
  clock source. Pick this aggregate device in REAPER (Preferences > Audio > Device).

Fallback if the aggregate device misbehaves: FP-30X `Output L/Mono` 1/4" ->
Scarlett input 2 (mono piano). MIDI can still come over USB.

Two virtual devices carry what the piano's own outputs never see:

- **IAC bus** for MIDI. Audio MIDI Setup > Window > Show MIDI Studio > double-click
  IAC Driver > check "Device is online". The default bus is named `IAC Driver Bus 1`.
  The app mirrors everything it sends the piano onto it: notes per hand on their own
  channels, plus the instrument changes. The piano's own MIDI output carries neither.
- **BlackHole 2ch** for audio (free, existingsoftware.com/blackhole or `brew install
blackhole-2ch`). The app plays sound-board samples through it, and it joins the
  aggregate device so REAPER can record it.

Touch input on macOS usually needs the monitor vendor's driver or a third-party
one such as UPDD. Plug-and-play touch is a Windows thing.

## REAPER project template

Create a project, then save it as the studio project (e.g. `Kid Studio.rpp`).

Tracks, all record-armed:

1. `Piano` - input: stereo pair from the FP-30X. Monitoring off; the piano's speakers
   already sound it.
2. `Piano MIDI` - input: MIDI, `IAC Driver Bus 1`, all channels. Free score/notation later.
3. `Samples` - input: stereo pair from BlackHole. Monitoring on, or he won't hear the
   sound boards.
4. `Vocal` - input: mono, Scarlett input 1. Monitoring on, or use the Scarlett's
   Direct Monitor switch.

Preferences worth setting:

- Audio > Recording: uncheck "Prompt to save/delete/rename new files" for stop.
- Project > "Auto-save every N minutes" as a belt-and-braces backup.
- Options > "Stop/repeat playback at end of project" off (page handles stopping).
- General > Startup: open the studio project on launch, or add it to the
  "Recently used" list and just leave REAPER open.

## Install the scripts

Copy `kidstudio_watcher.lua` to
`~/Library/Application Support/REAPER/Scripts/KidStudio/kidstudio_watcher.lua`.

Copy `__startup.lua` to `~/Library/Application Support/REAPER/Scripts/__startup.lua`
(merge with an existing one if you have it). REAPER runs it at launch and the
watcher stays running in the background. Nothing else to configure.

What the watcher does after each recording stops:

- finds the items created during that recording,
- trims the quiet tail off them (non-destructive: drag the item edge back out to recover it),
- adds a region `Take 7 - Sep 17, 04:12 PM` spanning them,
- moves the edit cursor 2 seconds past the end,
- saves the project.

### Runaway-recording backstop

If Record is pressed and never Stop, REAPER streams to disk at roughly 2.4 GB per hour for
the four-track template, so the watcher stops the take on its own in two cases:

- no configured input has shown activity for `silence_seconds` (default 3 minutes), or
- the take has reached `max_take_seconds` (default 60 minutes).

Both only ever stop. The take is still kept, named, trimmed, and saved.

Everything is in the `CONFIG` table at the top of `kidstudio_watcher.lua`:

| Key                | Default    | Meaning                                                     |
| ------------------ | ---------- | ----------------------------------------------------------- |
| `max_take_seconds` | 3600       | Hard cap on take length.                                    |
| `silence_seconds`  | 180        | Quiet time before the watcher stops the take.               |
| `trim_silence`     | true       | Trim each take to its last activity plus `tail_seconds`.    |
| `tail_seconds`     | 5          | Room left after the last note for sustain and decay.        |
| `activity`         | piano MIDI | Inputs that count as playing; any one keeps the take alive. |
| `gap_seconds`      | 2          | Silence between takes on the timeline.                      |

Activity sources:

- `{ type = "midi", device = "IAC" }` counts any note-on from a MIDI input device whose
  name contains the text. This is the default and the recommended choice for the piano: it
  covers every instrument he plays, including the sample-based sound boards that never
  reach the piano's audio output, and room noise cannot trigger it. The device must be
  enabled for input in REAPER's MIDI device list, which the IAC bus feeding the Piano MIDI
  track already is. Use `"Roland"` instead to watch the piano's raw MIDI.
- `{ type = "audio", track = "Vocal", threshold_db = -35 }` counts a track meter peak above
  the threshold. Useful for a mic, with the threshold set above the room's noise floor.
  The track must be metering its input while recording.

Set REAPER's own low-disk guard too, as the last line of defense: Preferences > Audio >
Recording, free disk space threshold, around 10 GB.

## The touch page

The touchscreen page is part of the Launchpad app (`@thrashplay/music`, in the opus monorepo),
not this folder. Run the app with REAPER's web remote address set and it serves the page:

```
MUSIC_REAPER_URL=http://localhost:8080 \
MUSIC_MIDI_MIRROR="IAC Driver Bus 1" \
MUSIC_SAMPLE_OUTPUT=BlackHole \
npx @thrashplay/music@latest
```

The app turns the piano's Local Control off while it runs and back on when it exits. If
it is ever killed outright and the piano goes silent, power-cycling the piano restores it.

REAPER side: Preferences > Control/OSC/web > Add > **Web browser interface**, port 8080. No
custom page is needed there; the app talks to the web remote's command API directly.

The page is at `http://localhost:8765` (`MUSIC_STUDIO_PORT` changes it). It shares one state
with the Launchpad's record/play pads, so a take started on either shows on both.

## Kiosk on the touchscreen

Put the touchscreen as an extended display and open the page fullscreen there:

```
open -na "Google Chrome" --args --kiosk --app=http://localhost:8765
```

REAPER stays on the laptop screen. Safari full-screen mode also works but its
toolbar pops in on touch near the top.

## How the page works

- **Record** stops anything playing, moves the cursor 2 s past the last take (or to the
  project end if there are none), then starts recording.
- **Stop** stops.
- **Play my last one** and the list play a take from its region start; playback stops at
  the region end.
- The list shows the newest 12 regions. Rename or delete regions in REAPER's Region
  Manager and the list follows.
- The level bar shows the loudest track peak so the kid can see it's listening.
- If the app or REAPER is down, the page greys out and reconnects on its own.

## Turning takes into songs

Everything is normal REAPER material. Select a region, `Time selection: set to
region`, then render, or copy the items to a fresh project. The MIDI track means
you can re-voice the piano with any instrument later.
