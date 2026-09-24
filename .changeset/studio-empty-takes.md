---
'@thrashplay/music': patch
---

Studio watcher: a take in which nothing was detected (no input activity, every recorded file scanned silent) is discarded rather than kept as an "(empty)" clip; `keep_empty_takes = true` restores the old behaviour. Routine events (auto-stops, untrimmed takes, a stop with no items) no longer open REAPER's console, which stole the screen from the touch page; only real problems do.
