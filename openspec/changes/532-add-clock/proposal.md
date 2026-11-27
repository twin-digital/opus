---
issue: https://github.com/twin-digital/opus/issues/532
milestone: https://github.com/twin-digital/opus/milestone/16
---

# Proposal

## Why

A construct changes only when an input arrives. A game must also advance when the player does nothing. The owner decided that the clock is a subsystem that sends ticks at an interval, and that a product that is not a game has no clock. The owner also decided that control is state: a pause is an input, and no subsystem calls a different subsystem. The architecture is in [#527](https://github.com/twin-digital/opus/issues/527).

## What Changes

- A new private package `@thrashplay/wishem-clock` in `nodejs/wishem/clock`. It uses no Node.js API.
- `time`: a model subsystem. Its part holds the time of the construct, the count of ticks, and `running`. It applies two inputs: `time/advance` and `time/set-running`.
- The clock: an input subsystem. While `running` is true, it sends one `time/advance` for each step of real time. Each tick advances the time of the construct by the same length.
- A pause is `time/set-running` with `false`. A step is one `time/advance` that a controller sends. A controller can send ticks faster than real time.
- A test supplies the timer and the source of real time, so a test needs no wait.

## Capabilities

### New Capabilities

- `wishem/clock/time`: the time of a construct: the `time` part, the tick, pause and resume, and the clock that sends ticks at normal speed.

### Modified Capabilities

None.

## Impact

- New package `@thrashplay/wishem-clock`, which depends on `@thrashplay/wishem-hub`, with its entry in `pnpm-lock.yaml` and in the package list of the root `README.md`.
- No change to a package that exists.
- Not in this change: rewind and replay ([#533](https://github.com/twin-digital/opus/issues/533)), and a product that uses the clock ([#536](https://github.com/twin-digital/opus/issues/536)).
