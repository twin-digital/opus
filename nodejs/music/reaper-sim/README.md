# @thrashplay/reaper-sim

An in-memory REAPER for testing and developing against REAPER without running it. It hosts ReaScript Lua scripts
(Lua 5.4, via [wasmoon](https://github.com/ceifa/wasmoon)) against a model of REAPER's state, and serves the web
remote against the same state.

```ts
import { ReaperSim } from '@thrashplay/reaper-sim'

const sim = new ReaperSim()
await sim.loadScriptFile('reaper/watcher.lua')

// the web remote, in process or over HTTP
await sim.fetch('/_/SET/PROJEXTSTATE/THRASHPLAY/REQ_1/%7B%7D')
const baseUrl = await sim.listen({ port: 8080 })

sim.tick() // one pass of REAPER's main loop: runs every deferred function once
const stop = sim.run() // or tick on a ~30 Hz timer

sim.model.currentProject.extState.entries('THRASHPLAY') // assert on state
sim.calls // or on the journal of ReaScript calls
sim.webRequests // and web remote commands
await sim.close()
```

Scripts and web remote requests all run on one thread, and each tick and each request completes before the next
starts. The simulator implements only what its callers need; a ReaScript function it lacks is a Lua error, and a web
remote command it lacks answers 501. REAPER answers an unknown command with 200 and no reply line; the simulator
fails loudly instead, so a test can't pass on a command it never ran.

## Fidelity

The simulator encodes what we believe about REAPER. Keep this list current as behavior is checked against the real
thing.

**Confirmed** (REAPER on Windows, probe runs of 2026-09-29)

- Ext-state sections and keys are stored upper-cased, whether Lua or the web remote writes them, and every lookup,
  from Lua or the web remote, finds them in any case. The web remote echoes the section and key as asked.
- `EnumProjExtState` enumerates keys in sorted order.
- An empty value deletes a project key, from Lua or the web remote, but keeps a global key, which then reads as
  empty and `HasExtState` still reports; `DeleteExtState` deletes a global key. `SetProjExtState` with an empty key
  deletes the section.
- The web remote's `SET` decodes percent-escapes in the section and key and its `GET` doesn't, so a key with `=`, a
  space or an encoded `/` can be written but not read back. `.` and `-` read back.
- Replies are tab-separated lines, one record per line. Fields escape tabs, newlines and backslashes (`\t`, `\n`,
  `\\`), in values the web remote or Lua wrote, and pass UTF-8 through. `GET` of a missing key replies with an
  empty value.
- Each command is cut off at 1023 characters as sent (URL-encoded, counting the `SET/<kind>/<section>/<key>/` prefix)
  and the request succeeds as usual; a cut-short `%` escape stays literal. A cut through a UTF-8 character stores the
  partial bytes, which decode as a replacement character; the simulator stores the replacement character.
- Replies carry values of at least 100,000 characters whole.
- REAPER answers no web remote request while a script's tick is busy; each waits for the tick to end, as in the
  simulator. The commands in one request run in order.
- `time_precise` counts seconds.
- `EnumProjects(-1)` handles compare equal while a tab stays current.
- REAPER answers an unknown web remote command with 200 and no reply line.

**Not modeled**

- After a long tick, REAPER can apply the requests that waited out of the order they were sent, and some fail with a
  connection-level error; the simulator answers them in arrival order.
- The largest request that gets a reply: about 6,400 characters on REAPER; the simulator answers any the HTTP server
  accepts.
