---
issue: https://github.com/twin-digital/opus/issues/642
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

A client stops and starts a product construct to start it again. When the workbench hub applies `constructs/stop` and `constructs/start` for one entry before the construct manager handles the stop, the construct manager sees only the state after the start. It keeps the old product construct: the same link, the same record, and the ticks continue. Nothing tells the client. The change #539 adds a control that starts a construct again, so this fault must be corrected first.

## What Changes

- Each entry of the construct list holds `startSeq`: the sequence number, in the workbench record, of the `constructs/start` that set the wanted state to `running`. A second start of a construct that is wanted to run keeps the entry and its `startSeq`. A report keeps it.
- The construct manager keeps the `startSeq` of each product construct that it starts. When the `startSeq` of the entry differs from it, the construct manager stops that product construct and starts a new one. This occurs also when a stop and a start are applied in one pass, and after a rewind of the workbench to a different start.
- The client of the link `raw-link.mjs` of the milestone A1 accepts more than one `--send`. It sends the inputs one after the other, with no wait, so that the test guide can send a stop and a start together.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/workbench/construct-list`: the entry holds the sequence number of the start that wrote it (the modified requirement "An input starts a product construct"), and a report keeps it (the new requirement "A report keeps the start of the entry").
- `wishem/workbench/construct-manager`: a stop and a start in one pass give a new product construct (requirement "The construct manager stops a construct that is not wanted"), and the construct manager compares the sequence number of the start after a rewind (requirement "The construct manager follows the list after a rewind").

## Impact

- `@thrashplay/wishem-construct-manager` (private): `ConstructEntry` gets the field `startSeq`. `construct-list.ts`, `construct-manager.ts`, their tests, and `README.md` change.
- `@thrashplay/wishem-workbench-app` (private): no code change. Its `start` script runs the construct manager, so a stop and a start through the workbench link always give a new product construct.
- `nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs` and `nodejs/wishem/docs/glossary.md` (the term **Construct list**).
- No persisted data changes. The construct list is not kept when the workbench stops.
