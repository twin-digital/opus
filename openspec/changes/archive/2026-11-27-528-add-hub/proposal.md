---
issue: https://github.com/twin-digital/opus/issues/528
milestone: https://github.com/twin-digital/opus/milestone/15
---

# Proposal

## Why

Wishem has one part that holds a model and gives a snapshot. It has no part that connects subsystems. The clock, the storage of the authored state, the renderers, and the workbench that runs a product all need one: a hub that takes inputs in one order, gives each input to the subsystems that hold state, and gives the joined state to the subsystems that read. The architecture is in [#527](https://github.com/twin-digital/opus/issues/527).

## What Changes

- A new private package `@thrashplay/wishem-hub` in `nodejs/wishem/hub`. It uses no Node.js API.
- A hub is made from an ordered list of model subsystems. A model subsystem declares the input types that it applies, and it changes its part of the state only when the hub gives it an input.
- An I/O subsystem attaches to a hub and gets a port. A port has three operations: send an input, read the joined state, and register a listener for the events of the hub. Only an input subsystem can send an input.
- The hub gives each accepted input a sequence number and the ID of its source, and appends it to the record. An input that is rejected changes nothing.
- The joined state has one part for each model subsystem. A part that an input did not change is the same object.
- The hub sends three events: started, applied, and stopping.

No existing package changes. The packages `core` and `host-nodejs` start to use the hub in [#529](https://github.com/twin-digital/opus/issues/529) and [#531](https://github.com/twin-digital/opus/issues/531).

## Capabilities

### New Capabilities

- `wishem/hub/construct`: the hub of one construct in one process: the subsystems and their kinds, the port, inputs and their order, the record, the joined state, and the events.

### Modified Capabilities

None.

## Impact

- New package `@thrashplay/wishem-hub`, with its entry in `pnpm-lock.yaml` and in the package list of the root `README.md`.
- No change to the behavior of a package that exists.
- Not in this change: the link between processes ([#530](https://github.com/twin-digital/opus/issues/530)), checkpoints, rewind, and replay ([#533](https://github.com/twin-digital/opus/issues/533)), and the clock ([#532](https://github.com/twin-digital/opus/issues/532)).
