-- Paths for cs-studio-import.lua. Written by install-producer.ps1; edit freely.
return {
  inbox = "",    -- the folder the Outbox is mirrored into (has one folder per project with manifest.json)
  projects = "", -- the studio's REAPER projects share, mounted read-only (P:\ or \\adept\Projects)
  min_seconds = 30, -- clips shorter than this are skipped (changeable per run in the dialog)
  watch_seconds = 300, -- how often the continuous importer looks for new clips
}
