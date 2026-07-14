---
'@thrashplay/music': minor
---

Add sound-board instruments: keys mapped to audio samples, played by the app itself.

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
