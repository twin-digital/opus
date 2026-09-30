# @thrashplay/reaper-client

A client for REAPER's web remote, and the Lua watcher that runs its commands inside REAPER. The watcher (`lua/`)
installs into REAPER as a whole directory and runs as a background script; the client reaches it through the web
remote alone.

```ts
import { createReaperClient } from '@thrashplay/reaper-client'

const reaper = createReaperClient({ url: 'http://10.0.0.5:8080', timeoutMs: 5000 })

const project = await reaper.currentProject() // { generation, name, path, runCommand }
const tracks = await project.runCommand('listTracks', {}, { timeoutMs: 2000 })
```

A request's `timeoutMs` can only shorten the client's. Commands fail with a `ReaperError` whose `code` is the
watcher's (`BAD_REQUEST`, `WRONG_PROJECT`, `UNKNOWN_COMMAND`, `STALE`, `FAILED`), the command's own (e.g.
`TRACK_NOT_FOUND`), or the client's (`REQUEST_TOO_LARGE`, `TIMEOUT`, `WATCHER_NOT_RUNNING`, `INCOMPATIBLE_WATCHER`,
`REAPER_UNREACHABLE`, `BAD_RESPONSE`). A command that fails with `TIMEOUT` or `REAPER_UNREACHABLE` is cancelled, but
may still have run.

## Projects and generations

The watcher names the current project with a random _generation_, made anew whenever the current project changes
(switching tabs, opening a file, a new project, the watcher starting). It marks the project with it, in project ext
state `GENERATION`: a tab keeps its handle when another project opens in it, and unsaved projects share an empty
path, so a project without the current generation's marker is how the watcher tells a replaced project apart. A
saved marker never matches a later session's generation, so a file reopened later, or a copy of one, gets a new one.

A project handle carries the generation it was made with, and the watcher refuses its commands with `WRONG_PROJECT` once the project
changes, even back to the same file. A caller that acts on what it showed a user holds on to the handle, or to its
generation (`reaper.project(generation)`), and gets a fresh one only when it's ready to act on the new project.

## Protocol

All keys live in ext-state section `THRASHPLAY`. REAPER stores sections and keys upper-cased and finds them in any
case; both sides use the upper-case spelling.

| Key           | Where             | Written by | Value                                                                                       |
| ------------- | ----------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `REQ_<id>`    | project ext state | client     | `{"v":1,"client":"…","seq":n,"generation":"…","command":"…","options":{…}}`                 |
| `CANCEL_<id>` | project ext state | client     | `1`: the client gave up on that request                                                     |
| `RES_<id>`    | global ext state  | watcher    | `{"v":1,"ok":true,"result":…}` or `{"v":1,"ok":false,"error":{"code","message","details"}}` |
| `GENERATION`  | project ext state | watcher    | the generation the watcher gave this project                                                |
| `WATCHER`     | global ext state  | watcher    | `{"v":1,"version":"…","generation":"…","heartbeat":n,"project":{"name":"…","path":"…"}}`    |

- **Requests** go to the project that is current when REAPER receives them, one key each, so writers never race. An
  id is 13 upper-case base-36 digits: milliseconds, then 4 random digits. The web remote cuts each command off at
  1023 characters, so the client refuses a longer one with `REQUEST_TOO_LARGE` rather than send it.
- **The watcher** reads the inbox every tick, in id order, deleting each request before running it. It checks for a
  project change before reading, so a request posted just before one is judged against the new project.
- **Busy REAPER.** While REAPER is busy (a long script tick, a render, loading a project), web remote requests wait,
  and can then land out of the order they were sent. Two guarantees hold anyway:
  - **A request its client gave up on never runs, unless it already ran.** A client that gives up on a request
    (`TIMEOUT`, or `REAPER_UNREACHABLE` once sent) writes `CANCEL_<id>`, and the watcher answers any request with a
    cancel beside it `CANCELLED` instead of running it, whichever of the two landed first. The watcher deletes a
    cancel whose request never lands after ten minutes.
  - **A client's writes to the same thing take effect in the order it sent them.** An older write that arrives late
    is dropped with `STALE`. A command that writes to one thing names it as its _target_ (e.g. `track:<guid>`); each
    request carries its client's id and a `seq` that counts up; and the watcher remembers, per client and target,
    the newest `seq` it ran. Callers don't see any of this: the client numbers its requests itself. Requests without
    a target, and requests from different clients, aren't ordered, and the watcher forgets a client idle for an
    hour.
- **Responses** go to global ext state, which a project switch can't hide and REAPER never saves. The client polls
  for its own key; the watcher deletes responses nobody collected after a minute.
- **Status** carries the generation, a heartbeat that counts about once a second, and the watcher's version (from
  the `manifest.json` an install writes beside it; `dev` without one). The watcher clears it when stopped, and
  hands over to a newer copy started beside it.

## Commands

A command is a module in `lua/commands/`, named by its file, returning `function(options, context)`, or
`{ run = function(options, context), target = function(options) }` for one that writes to one thing;
`context.project` is the current project. Its return value is the result, encoded with
[rxi/json.lua](https://github.com/rxi/json.lua) (`lua/lib/json.lua`), which encodes an empty table as `[]`.

A command answers with its own error code by failing with `error({ code = "TRACK_NOT_FOUND", message = "…",
details = … })`. One that throws anything else, fails to load, or returns something JSON can't hold answers
`FAILED`; the watcher keeps running.

## Testing

Tests run the real watcher inside `@thrashplay/reaper-sim`, with the fixture commands in `test/commands/` mounted
as its `commands/`.
