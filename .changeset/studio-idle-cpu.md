---
'@thrashplay/music': patch
---

Studio watcher: an idle studio costs almost nothing. The library and Outbox pass runs when the project changed or once a second, not every tick; requests from the page are scanned only when the app has written one (it bumps a sequence with each) or every two seconds; a clip file's presence is remembered for a few seconds. REAPER sat near 40% CPU at idle before, which also made it answer the web remote late enough for an end-of-clip stop to go astray.
