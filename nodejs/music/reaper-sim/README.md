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

**Confirmed** (REAPER on Windows, probe run of 2026-09-29)

- Ext-state sections and keys are stored upper-cased, whether Lua or the web remote writes them (a saved `.rpp`
  holds `<PROBE_LUA_SECTION` / `PROBE_LUA_KEY p` for a Lua write of `Probe_Lua_Section` / `Probe_Lua_Key`), and every
  lookup, from Lua or the web remote, finds them in any case. The web remote echoes the section and key as asked.
- `EnumProjExtState` enumerates keys in sorted order.
- An empty value deletes a project key, from Lua or the web remote, but keeps a global key, which then reads as
  empty and `HasExtState` still reports; `DeleteExtState` deletes a global key.
- The web remote's `SET` decodes percent-escapes in the section and key and its `GET` doesn't, so a key with `=`, a
  space or an encoded `/` can be written but not read back. `.` and `-` read back.
- Replies are tab-separated lines, one record per line. Fields escape tabs, newlines and backslashes (`\t`, `\n`,
  `\\`), in values the web remote or Lua wrote, and pass UTF-8 through.
- `GET` of a missing key replies with an empty value.
- Each command is cut off at 1023 characters as sent (URL-encoded, counting the `SET/<kind>/<section>/<key>/` prefix)
  and the request succeeds as usual; a cut-short `%` escape stays literal. A cut through a UTF-8 character stores the
  partial bytes, which decode as a replacement character; the simulator stores the replacement character.
- Replies carry values of at least 100,000 characters whole.
- `time_precise` counts seconds.
- `EnumProjects(-1)` handles compare equal while a tab stays current, and a tab keeps its handle when
  `Main_openProject` opens another file in it; only the path changes, and reopening the same file changes neither.
- Ext-state writes, from Lua or the web remote, don't mark a project changed.
- `EnumerateFiles` lists a directory the same with or without a trailing separator, then returns `nil`.
- `debug.getinfo(1, "S").source` is `@` followed by the script's path (backslash-separated on Windows).
- Scripts have Lua 5.4's standard libraries, `io` included.
- `atexit` functions don't run when a script dies of an error.
- REAPER answers an unknown web remote command with 200 and no reply line.
- REAPER answers no web remote request while a script's tick is busy; each waits for the tick to end, as in the
  simulator. In an eight-second tick with requests every 200 ms, none was answered during it, including the request
  whose write started the tick (8,063 ms), and the script saw no write land during it.
- The commands in one request run in order: a `SET` then `GET` of one key reads back its own write.
- Web remote reads see Lua's ext-state writes (a script's `SetExtState` is visible to the next request).
- `GetInputChannelName` reports the audio driver's channel names (e.g. `VM-VAIO 1`); whether it reports a channel
  renamed in REAPER's preferences is untested.

**Not modeled** (the probe records each)

- After a long tick, REAPER works through the requests that waited in bursts about a second apart, while requests
  arriving afresh are answered at once, so writes can land out of the order they were sent: of writes 1–55 to one
  key, 24 was the last to land. Some requests that waited failed outright (21 of 165, a connection-level error).
  The simulator answers waiting requests in the order they arrived, and none fails.
- The largest request that gets a reply: about 6,400 characters on REAPER; the simulator answers any the HTTP server
  accepts.
- `EnumerateFiles` order: REAPER's is the file system's, not sorted; the simulator's is sorted.
- `IsProjectDirty` always answers 0.
- Project files: `Main_SaveProjectEx` writes nothing.
- The web remote's username and password.
