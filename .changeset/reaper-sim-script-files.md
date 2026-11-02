---
'@thrashplay/reaper-sim': minor
---

Scripts run from disk can load their siblings; `mountFile`/`mountDirectory` add files scripts see, and `stopScript`
ends one. Adds `EnumerateFiles`, `atexit` (run when a script ends, but not when it dies of an error),
`Main_openProject`, `Main_SaveProjectEx` and `IsProjectDirty`, and a probe that checks the modeled behaviors against
a running REAPER.
