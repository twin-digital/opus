---
'@thrashplay/music': patch
---

Fix the unbounded memory leak that crashed the app after days of uptime. `MidiDeviceWatcher`
now enumerates ports through a single long-lived `@julusian/midi` client pair instead of
`easymidi.getInputs()/getOutputs()`, which leak a pinned native MIDI client on every call
(dinchak/node-easymidi#51) — at the watcher's polling rate, enough to exhaust the heap in a
handful of days. Numbered-name deduplication is preserved so watcher names keep matching the
easymidi device constructors. Also slows the default poll from 100ms to 500ms and unregisters
`getFirmwareVersion`'s identity-response listener on the success path.
