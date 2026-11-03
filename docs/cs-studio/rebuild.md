# CS Studio rebuild

The rebuild starts from the first stack of CS Studio PRs (#440 `csst-api` + `reaper-sim`, #443
`reaper-client` with the watcher core, #444 track commands), all unmerged drafts, and from the
prototype in `@thrashplay/music`. Decisions are in [design.md](design.md). This page is the plan.

The rebuild is also the trial of a new workflow: a design conversation per slice (Superpowers
brainstorming), an OpenSpec change per slice (`openspec/`), implemented test-first in a worktree,
reviewed as a PR, archived into the main specs on merge.

## What carries over

| From the first stack              | Call             | Why                                                                                                                                          |
| --------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `reaper-sim`                      | Keep             | Ground truth, two probe runs recorded. Grows only in the data-only direction.                                                                |
| `reaper-sim/probe`                | Keep, extend     | The only source of truth about REAPER.                                                                                                       |
| `reaper-client` Lua               | Rebuild, reusing | Command-module shape, `refuse.lua`, `recinput.lua` (encoding verified against the docs), `tracks.lua` logic. Protocol changes per design.md. |
| `reaper-client` TS                | Rebuild, reusing | `inputChoices`, the typed command surface. Must be browser-safe. Needs built-in `TRANSPORT`/`TRACK` parsing from the prototype for reads.    |
| `csst-api`                        | Rebuild          | The hosted API on the studio machine: sole client of the watcher, serves the UI, fans out live state. The scaffold is replaced.              |
| Prototype `cs-studio-watcher.lua` | Mine, don't port | Its domain logic is the spec for clips and the Outbox; its loop, request handling, and in-tick renders are not.                              |
| Prototype `src/studio/`           | Mine             | `reaper-client.ts` built-in parsing; `studio-service.ts` retry and transport lessons.                                                        |

The repo currently holds two REAPER clients and two watchers. The rebuild ends with one of each.

## Status of the first stack

Proposed, not yet decided: merge #440 so the simulator and probe land reviewed, with the `csst-api`
scaffold either dropped from it or replaced in a later change; close #443 and #444 unmerged as reference. Review threads on #440 and #443 are all
answered; #444 was never reviewed.

Outstanding on the probe, in `reaper-tracks` (#444):

- The `TRACKS` step has not run on REAPER. Until it does, the `I_RECINPUT` encodings and new-track
  defaults are Assumed, and the 31 track tests prove agreement with the simulator, not REAPER.
- The audio input channel list came back empty on the 2026-11-02 run; the 2026-09-29 run listed
  eight channels. Run with an audio device active.

## Work, in order

Each numbered item is a candidate OpenSpec change. Items within a group are independent.

**1. Baseline**

- Write the main spec for the simulator and probe as they stand (done with this page).
- Move the arrow-function and multi-line doc-comment rules into a shared `@twin-digital/eslint-config`
  export stamped by repo-kit, instead of three identical `eslint.config.d/10-style.js` fragments.
- Open the repo-wide multi-line doc comment issue asked for on #440.

**2. Probe additions** (run together, one trip to the REAPER machine)

- `TRACKS` step with an audio device active.
- A write of an absent MIDI device index.
- `os.time()` availability and value, for the deadline clock.
- Turn the write-reordering check from PASS/FAIL into INFO; it is listed as not modeled.

**3. Watcher core** (brainstorm first)

- Deadline in the request, watcher clock in the status key, cancel markers removed.
- Heartbeat consumed by the client; `WATCHER_NOT_RUNNING`.
- Per-track write queue in the client, sequencing removed from the watcher.
- Payload limit documented; `REQUEST_TOO_LARGE` kept.
- An idle loop for slow work, with the rule that no command blocks a tick.
- README written for the new protocol.

**4. Track commands**

- Port `listInputs`, `listTracks`, `createTrack`, `updateTrack` onto the new core.
- Accept absent MIDI devices; list them as not connected.
- Simulator: items, takes, regions, markers, project info as records; journaled transport, render,
  save.

**5. The API and the UI** (brainstorm first)

- `csst-api`: the HTTP API over the track commands, the live channel for transport and meters,
  static serving of the UI, as the sole client of `reaper-client`.
- Built-in `TRANSPORT`/`TRACK` reads in the API for live state and meters.
- The browser UI: tracks, inputs, arm, record, play back.
- The Launchpad app moved onto the API.

**6. Clips and the Outbox** (brainstorm first)

- Clip regions after each recording, trimming by activity, stop on silence.
- Library manifest, atomic renders, MIDI export, renames, as idle-loop steps.

**7. Deployment**

- Installer for the watcher and commands into REAPER on the studio machine; the API and UI ship by npm.
- Command reload, if an installer makes it worth having.
- Retire the prototype's studio code and watcher.
