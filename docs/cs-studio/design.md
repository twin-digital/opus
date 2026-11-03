# CS Studio design

CS Studio is the control surface for a small home recording studio: REAPER records, and a touch UI
plus a Novation Launchpad let a grade-schooler create tracks, pick inputs, arm, record, and play
back without touching REAPER itself. It replaces the studio touch page in `@thrashplay/music`
(`nodejs/music/music/src/studio/`, `reaper/studio/`), which remains the reference for the studio's
domain behavior until each piece is rebuilt here.

This document records the design decisions. [rebuild.md](rebuild.md) holds the plan and the status
of the earlier stack. Confirmed REAPER behaviors live in the simulator README
(`nodejs/music/reaper-sim/README.md`), which is the only place they are recorded.

## Machines

Two REAPER machines, with different constraints:

- **The studio machine** is the deployment target. It runs REAPER and can run Node. Product
  decisions are made for this machine.
- **The dev machine** is a Windows PC on the dev LAN with REAPER and its web remote, reachable from
  the devcontainer. It runs no Node. This is a soft, dev-time constraint: it may make testing
  clunkier, and it never shapes product requirements. If a design needs Node beside REAPER during
  development, a dev machine that has both can be set up.

## Architecture

```
iPad (browser)  ──HTTP/WS──▶  csst-api (Node, studio machine)  ──HTTP──▶  REAPER web remote (8080)
Launchpad app   ──HTTP/WS──▶        │                                            │
                              reaper-client (SDK)                      watcher.lua + commands/
```

- **A hosted API on the studio machine, `csst-api`, is the only thing that talks to REAPER.** It
  links `@thrashplay/reaper-client` as its SDK, serves the browser UI's files, and offers the
  browser and the Launchpad app one HTTP API plus a live channel for transport, meters, and the
  selected track. Cross-client state lives in the API, not in each client. It runs on the studio
  machine, so it sees recorded files and the Outbox directly.
- **REAPER is driven through its web remote and a Lua watcher.** The API writes requests into
  project ext state (`THRASHPLAY/REQ_<id>`) over the web remote; the watcher runs them inside
  REAPER each tick and answers in global ext state (`RES_<id>`). ReaScript has no sockets, so this
  is the only channel that needs nothing installed beside REAPER, and it is the one channel for every
  write.
- **Reads that need to be fast** (transport state, meters) use the web remote's built-in `TRANSPORT`
  and `TRACK` replies plus a status key the watcher publishes, polled once by the API and fanned out
  to clients.
- **The browser UI runs on an iPad** and talks only to the API. The web remote is GET-only and
  sends no CORS headers (measured 2026-11-02), so a browser could never reach it from another
  origin; the API is its path.
- **The Launchpad stays a standalone Node app** on the studio machine, as `@thrashplay/music` is
  today, and becomes a client of the API rather than of REAPER.

## Watcher protocol

Guarantees a client gets, and the mechanism behind each:

- **A request runs at most once.** The watcher deletes a request before running it.
- **A request never lands in the wrong project.** Every request carries a generation, a random token
  made on each project change and written into the project as a marker. A request for another
  generation is refused with `WRONG_PROJECT`.
- **A request the client gave up on never runs.** Each request carries a deadline on the client's
  clock; the watcher refuses one whose deadline has passed when it lands. The watcher publishes its
  own clock in its status key so the client can offset skew. This replaces cancel markers, which
  were a second write into the same congestion and could lose the race.
- **A client's writes to one track land in order.** The client queues writes per track and reads the
  track back after each. With the deadline refusing late arrivals, no watcher-side sequencing is
  needed.
- **A dead watcher is reported as such.** The status key carries a heartbeat; the client reads it
  alongside each request it posts and again on timeout, and raises `WATCHER_NOT_RUNNING` when it
  has not moved, since `atexit` does not run when a script dies of an error.
- **Versions match.** The status key carries protocol and watcher versions; a second watcher copy
  started beside the first takes over.

Limits and rules:

- A web remote command is cut at 1023 characters. After the request envelope and percent-encoding,
  about 450 characters of options JSON fit. The client refuses larger requests
  (`REQUEST_TOO_LARGE`). Commands act on one entity each; there are no batch commands.
- Commands are modules in `commands/`, loaded by the watcher and run under `pcall`. A command refuses
  with its own error code; one that throws answers `FAILED` and the watcher keeps running.
- **Nothing slow runs in a request tick.** REAPER answers no web remote request while a tick runs,
  and after a long one it lands waiting requests out of order and drops some. Renders, peak scans,
  saves, and library writes run from an idle loop in steps, never inside a command.

## Track commands

- Tracks are addressed by REAPER's track GUID.
- Inputs are structured (`none`, `audio` mono or stereo by start channel, `midi` by device and
  channel) with REAPER's `I_RECINPUT` integer visible as `raw`. Encodings the commands don't produce
  (multichannel, ReaRoute) read back as `other` and are never written.
- A MIDI device REAPER knows but can't open right now is a valid input: the studio is configured
  before the piano is switched on. Only an unknown device slot is refused. Input choices list absent
  devices as not connected.
- Labels are built in the client from REAPER's data (`listInputs`). Stereo choices are even-aligned
  pairs only.
- Writes validate everything, then run as one undo point, and answer with the track as REAPER then
  has it.

## Simulator and probe

`@thrashplay/reaper-sim` hosts the real Lua in a model of REAPER so the watcher and commands are
tested without REAPER. `probe/` checks every modeled behavior against a running REAPER.

- **The simulator models data, not behavior.** Ext state, projects, tracks, items, takes, regions,
  markers, and project info are inert records. Transport, render, save, and file calls are journaled
  no-ops a test can assert on. Audio and MIDI signal, and recording producing items, are never
  modeled; a test seeds the items REAPER would have made.
- **A missing function is an error**, so an untested belief can't be satisfied by a lenient default.
- **Every behavior the simulator models is Confirmed or Assumed in its README.** An Assumed bullet is
  dated and names the change that added it; it moves to Confirmed only with the date of the probe run
  that checked it. A test that rests on an Assumed item says so in a comment. A change that adds
  simulator surface adds its probe step in the same change.
- The probe needs a person at the REAPER machine. Agents develop against the simulator and ship the
  probe step; probe runs happen in batches, and a FAIL becomes a simulator fix.

## Deployment

- An installer copies the watcher and its command modules into REAPER's resource path on the
  studio machine. Nothing deploys by hand.
- `csst-api`, with the browser UI's files, and the Launchpad app deploy as `@thrashplay/music` does
  today, through npm.

## Open questions

- **Clip, library, and Outbox behavior.** The prototype watcher's rules (clip regions after each
  recording, trimming by activity, stop on silence, the manifest, atomic renders, MIDI export,
  renames) are the domain knowledge to carry over, re-expressed as commands and idle-loop steps, with
  the API serving the results. Not yet designed here.
