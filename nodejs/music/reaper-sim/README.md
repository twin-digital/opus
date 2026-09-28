# @thrashplay/reaper-sim

An in-memory REAPER for testing and developing against REAPER without running it. It hosts ReaScript Lua scripts
(Lua 5.4, via [wasmoon](https://github.com/ceifa/wasmoon)) against a model of REAPER's state, and serves the web
remote against the same state.

```ts
import { ReaperSim } from '@thrashplay/reaper-sim'

const sim = new ReaperSim()
// runs a script from disk; its directory is mounted so it can loadfile its siblings
const script = await sim.loadScriptFile('lua/watcher.lua')
await sim.mountFile('/elsewhere/extra.lua', 'return 1') // or add files scripts can see

// the web remote, in process or over HTTP
await sim.fetch('/_/SET/PROJEXTSTATE/THRASHPLAY/REQ_1/%7B%7D')
const baseUrl = await sim.listen({ port: 8080 })

sim.tick() // one pass of REAPER's main loop: runs every deferred function once
const stop = sim.run() // or tick on a ~30 Hz timer
sim.stopScript(script) // end a script as a user does; its atexit functions run

sim.model.currentProject.extState.entries('THRASHPLAY') // assert on state
sim.calls // or on the journal of ReaScript calls
sim.webRequests // and web remote commands
await sim.close()
```

Scripts and web remote requests all run on one thread, and each tick and each request completes before the next
starts. A script ends once its main chunk and deferred functions have all returned with nothing more deferred, when
stopped, or when the simulator closes, and its `atexit` functions run; a script that dies of an error skips them.

The simulator implements only what its callers need; a ReaScript function it lacks is a Lua error, and a web remote
command it lacks answers 501. REAPER answers an unknown command with 200 and no reply line; the simulator
fails loudly instead, so a test can't pass on a command it never ran.

## Fidelity

The simulator encodes what we believe about REAPER. Keep this list current as behavior is checked against the real
thing: `probe/` checks each modeled behavior against a running REAPER (see its README), and passes against the
simulator itself.

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
  and the request succeeds as usual. Other commands in the same request are unaffected; a 3.5 KB request of short
  commands applies them all.
- `SetProjExtState` with an empty value deletes the key; with an empty key, the section.

**Assumed** (the probe checks all but the first two)

- A cut that splits a UTF-8 character leaves a replacement character, and a cut-short `%` escape stays literal.
- Opening another file in the same tab changes what `EnumProjects(-1)` returns: the handle, the path, or both.
- REAPER runs web remote requests and deferred script functions on its main thread, so neither interrupts the other.
- `GetExtState` from Lua matches case-sensitively, like `GetProjExtState`.
- `EnumProjExtState` enumerates in insertion order.
- `SetExtState` with an empty value deletes the key, whether Lua or the web remote writes it.
- `EnumProjects(-1)` returns handles that compare equal while the project stays current.
- `EnumerateFiles` lists a directory's files in name order, with or without a trailing separator, then returns `nil`.
- `debug.getinfo(1, "S").source` is `@` followed by the script's path.
- Scripts have Lua 5.4's standard libraries, `io` included.
- `atexit` functions don't run when a script dies of an error.

**Not modeled**

- A request of 16 KB or more gets no reply at all.
- Replies of any length come back whole; the probe records how long a value REAPER replies with.
- `IsProjectDirty` always answers 0; the probe records whether ext-state writes mark a project changed.
- The web remote's username and password.
