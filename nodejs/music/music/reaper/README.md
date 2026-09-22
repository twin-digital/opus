# REAPER studio setup

Two machines, two folders here:

- `studio/`: what runs inside REAPER on the studio Mac. The app installs it; nothing to copy.
- `producer/`: what runs inside REAPER on the machine where clips are reviewed and turned into
  songs. Installed once by `install-producer.ps1`.

The REAPER side of the piano recording corner. The touch page and the Launchpad
transport live in `@thrashplay/music`; this folder holds the ReaScript that runs inside
REAPER and the setup notes for the Mac. Every recording lands as a new item in a normal REAPER
project, wrapped in a named "Clip N" region, and the project auto-saves.

```
Touchscreen (browser)  ──▶  @thrashplay/music (Node)  ──HTTP──▶  REAPER web interface (8080)
Launchpad pads         ──▶        StudioService                        │
                                                        cs-studio-watcher.lua (background)
                                                        names, trims, saves each take
```

# Studio machine

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

## The watcher installs itself

The studio app ships the watcher and installs it into REAPER's resource path every time it
starts: `Scripts/Studio/cs-studio-watcher.lua`, a `Scripts/Studio/cs-studio-config.lua` for
your settings (created once, never overwritten), and a line in `Scripts/__startup.lua` that
loads the watcher when REAPER launches. Restart REAPER once after the first install.

The app compares a hash of the watcher it ships with the hash the running watcher reports.
When they differ it asks the watcher to reload itself (no REAPER restart), and if that
fails, or no watcher is running, it refuses to start and says why. `--ignore-helper-mismatch`
starts it anyway; the touch page then shows a banner and the Launchpad record pad stays dark.

`MUSIC_REAPER_RESOURCE_PATH` overrides the resource path (Options > Show REAPER resource
path shows it). Settings go in `cs-studio-config.lua`, not the watcher: editing the watcher
changes its hash and trips the check.

What the watcher does after each recording stops:

- finds the items created during that recording,
- trims the quiet head (the seconds between pressing Record and the first note) and the
  quiet tail off them (non-destructive: drag the item edges back out to recover the audio),
- adds a region `Clip 7 - Sep 17, 04:12 PM` spanning them,
- moves the edit cursor 2 seconds past the end,
- saves the project.

### The Outbox

Beside the project, the watcher keeps `cs-studio-library.json`: one entry per clip with its
number, label, bounds, when it was made, how it stopped (user, silence, cap), the source
file per track, and its render record. It is the source of truth for everything about a clip
that is not "where it sits on the timeline", which stays with the region.

While the studio is idle, the watcher fills the Outbox (`~/Music/Studio Outbox` by default),
one folder per project:

```
Studio Outbox/
  Piano Corner 2026/
    20260922 - 0011 - Clip 11.wav
    20260922 - 0012 - Twinkle.wav
    20260922 - 0012 - Twinkle.mid
    manifest.json
```

- The `.wav` is the master mix of the region, in the project's current render format (WAV
  unless you changed it), normalized to `normalize_lufs` (-14 LUFS, the level streaming
  services use) so it plays at a normal volume on a phone however quiet the piano's USB
  signal is. The recorded files are never changed.
- The `.mid` is the clip's MIDI: each hand on its own channel with the program changes,
  written by the watcher itself.
- `manifest.json` is the library exported next to the files.

File names are the clip's recording date, its number padded to four digits so they sort, and
its given name, or "Clip 12" when it has none ("Clip 12 (empty)" when nothing was played).
A rename moves the files; trimming a region in REAPER re-renders it; deleting a region
removes its files and its entry.

A clip up to `render_now_seconds` (3 minutes) is rendered the moment it ends, a second or two
of REAPER's time, so its waveform is on the page almost at once. Longer clips, re-renders after
a trim, and the backlog wait for idle. Idle means: the transport is stopped, no key has been
pressed and nothing has started or stopped for `render_idle_seconds` (30). One clip renders per pass, and the loop re-checks
before the next, so playing again stops the batch. A render freezes REAPER for a second or
two; clips longer than `render_long_seconds` (10 minutes, which only the length cap makes)
wait for `render_long_idle_seconds` (5 minutes) instead. The app tolerates the short stall
without showing the page as offline.

Point Syncthing at the Outbox as a send-only folder to get the files onto another machine.

## Runaway-recording backstop

If Record is pressed and never Stop, REAPER streams to disk at roughly 2.4 GB per hour for
the four-track template, so the watcher stops the take on its own in two cases:

- no configured input has shown activity for `silence_seconds` (default 3 minutes), or
- the take has reached `max_take_seconds` (default 60 minutes).

Both only ever stop. The take is still kept, named, trimmed, and saved.

Everything is a key in `cs-studio-config.lua`, overriding these defaults:

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
- The list shows every region, newest by clip number, so a take recorded from
  REAPER's own transport with the cursor parked earlier on the timeline still sorts as the
  latest. Rename or delete regions in REAPER's Region Manager and the list follows; keep
  the "Clip N" prefix when renaming, or the take drops to the bottom of the list.
- The pencil on a clip opens a naming sheet with an on-screen keyboard. The name is
  written into the project's ext state, and the watcher renames the region to
  "Clip N - <name>" and saves, so the clip keeps its place in the list. Rename in REAPER's
  Region Manager works the same way as long as the "Clip N" prefix stays.
- The strip under the header shows the selected clip (the one last played or just recorded):
  its waveform from the Outbox mix, a plain progress bar until that exists, with a cursor that
  follows playback; tap or drag on it to play from there. While recording it shows a live level
  graph. Track meters with peak hold stand at the strip's right edge at all times. Each shows
  the louder of the track's input (REAPER meters an armed track from its input, even while
  stopped) and what the track plays back, which the watcher reads from the items at the play
  position and publishes, since REAPER's own meters show nothing of playback on an armed track.
- If the app or REAPER is down, the page greys out and reconnects on its own.

# Producer machine

The Outbox reaches this machine as a mirror (the Inbox), and the studio's REAPER projects
folder is mounted read-only (see [Getting the Outbox here](#getting-the-outbox-here)).

## Install the producer scripts

From PowerShell, with your two paths:

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/twin-digital/opus/main/nodejs/music/music/reaper/producer/install-producer.ps1 -OutFile install-producer.ps1
powershell -ExecutionPolicy Bypass -File install-producer.ps1 -Inbox "D:\Users\sean\Nextcloud\1 - Projects\Lucas Music\Studio" -Projects "P:\" -MinSeconds 30 -Watch
```

It downloads `cs-studio-import.lua` and the probe into REAPER's `Scripts\Studio` folder and
writes `cs-studio-import-config.lua` with the paths. Run it again any time to update; the
config is rewritten from the parameters you pass. `-MinSeconds` sets the length threshold,
`-Watch` adds the continuous importer to REAPER's startup script, `-Ref` fetches from a branch
instead of main, `-ResourcePath` overrides REAPER's resource path.

Once, after the first install: REAPER > Actions > Show action list > New action > Load
ReaScript, pick `Scripts\Studio\cs-studio-import.lua`. It is then an action you can run,
or bind to a key.

## Bless: import clips into the open project

A clip is eligible when it was named in the studio (not the default "Clip N"), is at least
`min_seconds` long (30 by default), and has not been imported into this project before.
Imports are recorded in the project itself, so deleting a clip's tracks does not bring it
back.

Open (or create and save) the song project you want the clips in. Run the import action:

1. The console lists the eligible clips: name, project, date, length, `*` for starred ones,
   and a note on any shorter than the threshold.
2. A dialog shows the threshold, changeable for this run, and takes an optional list of
   numbers to import only some. Leave it blank for all of them.
3. Before anything is made, every chosen clip's files are checked: the stems on the projects
   share and the MIDI file in the Inbox. A clip with something missing (the mirror has not
   caught up, the share is not mounted) is skipped for now and reported, not recorded.
4. For each clip the script copies its stems from the projects share into the song project's
   media folder (verified copies, never overwriting a different file), so the project is
   self-contained, and builds a folder track named `0012 - Twinkle` with the stems and the
   MIDI as children, all at time zero and trimmed to the clip. MIDI timing follows the tempo
   the file was written at, so it lines up with the stems whatever the song's tempo. Every
   folder but the first is muted, so the project does not play everything at once. A clip
   that fails part-way is removed again and left unrecorded. The project is saved.

Where the song project lives, inside Nextcloud or not, is up to you; the stems ride along.

### Continuous import

`cs-studio-import-watch.lua` keeps the importer running: every `watch_seconds` (300) while
the transport is stopped, it brings new eligible clips into the open project without asking,
using the configured threshold. It only does this in a project that has had one on-demand
import, which is the opt-in, and it never saves: the tracks arrive as an undoable edit and are
kept when you save. Load it from the Actions list to run it for a session, or install
with `-Watch` to start it whenever REAPER launches.

## Getting the Outbox here

Share the Outbox and the REAPER projects folder from the Mac (System Preferences > Sharing >
File Sharing, with SMB on; the projects share read-only). On Windows, a scheduled `robocopy`
mirrors the Outbox share into the Inbox every few minutes:

```bat
@echo off
if not exist "\\adept\Studio Outbox" exit /b 0
robocopy "\\adept\Studio Outbox" "D:\...\Studio" /MIR /R:1 /W:1 /NP /NFL /NDL /XD .stfolder /LOG+:"%LOCALAPPDATA%\studio-sync.log"
exit /b 0
```

registered with `schtasks /Create /TN "Studio Outbox sync" /TR "wscript.exe C:\...\studio-sync.vbs" /SC MINUTE /MO 5`,
where the `.vbs` runs the `.cmd` with no window:
`CreateObject("WScript.Shell").Run """C:\...\studio-sync.cmd""", 0, False`.
The guard line keeps `/MIR` from emptying the Inbox when the Mac is asleep. Put the Inbox
inside a Nextcloud folder and everything in it is backed up until the studio removes it.

## Without the import script

Everything is normal REAPER material. Copy a project folder from the share to a working
location, open the copy, select a region, and save the selected items as a new project. The
MIDI track means you can re-voice the piano with any instrument later.
