---
'@thrashplay/music': patch
---

Producer import: runs as a background job, copying stems a chunk at a time between REAPER timer ticks, so REAPER stays responsive during a large import; progress per clip in the console, one undo step per clip.
