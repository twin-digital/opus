-- Settings for cs-studio-watcher.lua. Any key here overrides the watcher's default; delete a
-- line to fall back. This file is yours: the studio app installs and updates the watcher
-- beside it but never touches this file.
return {
  -- debug = true,                 -- log each step to REAPER's console
  -- max_take_seconds = 60 * 60,   -- hard cap on take length
  -- silence_seconds = 3 * 60,     -- quiet time before the watcher stops the take
  -- tail_seconds = 5,             -- room left after the last note when trimming
  -- activity = {                  -- inputs that count as playing
  --   { type = "midi", device = "IAC" },
  --   { type = "audio", track = "Vocal", threshold_db = -35 },
  -- },
  -- outbox = "~/Music/Studio Outbox", -- where each clip's mix, MIDI file, and the manifest go
  -- render = true,                -- render a mix per clip while idle
  -- midi_export = true,           -- write a .mid per clip
  -- render_idle_seconds = 30,     -- idle before the watcher renders (no keys, no transport change)
  -- normalize_lufs = -14,         -- loudness of the rendered mix; false to leave it at the project's level
}
