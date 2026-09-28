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
thing; `probe/` holds the in-REAPER half of a probe.

**Confirmed** (checked against a running REAPER)

- The web remote upper-cases the section and key of `SET/PROJEXTSTATE` and `SET/EXTSTATE`; `GET/PROJEXTSTATE` and
  `GET/EXTSTATE` match them ignoring case, echoing the section and key as asked.
- `GetProjExtState` from Lua matches case-sensitively, so Lua reads web remote writes under the upper-case spelling.
- Replies are tab-separated lines, one record per line. Fields escape tabs, newlines and backslashes (`\t`, `\n`,
  `\\`).
- `GET` of a missing key replies with an empty value.
- Each command is cut off at 1023 characters as sent (URL-encoded, counting the `SET/<kind>/<section>/<key>/` prefix)
  and the request succeeds as usual. Other commands in the same request are unaffected; a 3.5 KB request of short
  commands applies them all.
- `SetProjExtState` with an empty value deletes the key; with an empty key, the section.

**Assumed**

- REAPER runs web remote requests and deferred script functions on its main thread, so neither interrupts the other.
- `GetExtState` from Lua matches case-sensitively, like `GetProjExtState`.
- A cut that splits a UTF-8 character leaves a replacement character, and a cut-short `%` escape stays literal.
- `EnumProjExtState` enumerates in insertion order.
- `SetExtState` with an empty value deletes the key.

**Not modeled**

- A request of 16 KB or more gets no reply at all.
