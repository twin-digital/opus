---
issue: https://github.com/twin-digital/opus/issues/639
milestone: https://github.com/twin-digital/opus/milestone/11
---

# Proposal

## Why

The link has two clients: the reference client of `hub` (TypeScript) and the client of `renderer-godot` (GDScript). They do not obey the same rule for three details of a message of the hub side, and `hub/LINK.md` does not decide them. One protocol has one rule (Ruling L1 of the change `541-add-godot-renderer`). A client that obeys `LINK.md` must not get a different result from a different client.

## What Changes

- A `result` message with the two keys `result` and `error` is malformed. Each client closes the connection. The reference client lets `error` win now, and the GDScript client lets `result` win.
- A `result` message is malformed also when `request` is not an integer, when `result` is not an object with a boolean `ok`, or when `error` is not text. The reference client accepts a fractional `request`. The GDScript client accepts a `result` with no `ok`.
- A number of a message of the hub side (`protocol` and `seq` of `welcome`, `seq` of the input of `applied`, `request` of `result`) that is not an integer from 0 to 2^53 - 1 makes the message malformed. The client closes the connection when the message arrives. The reference client accepts a fractional or negative `seq` of `welcome`, and closes the link only at the next `applied`. The GDScript client accepts a negative number.
- A `welcome` message with a status other than `created` or `running` is malformed. The reference client accepts `stopped`, and the GDScript client accepts each status.
- `LINK.md` states each of these rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/hub/link`: a client closes the connection for a malformed message of the hub side, and the protocol gives the full list of the malformed forms of `welcome` and `result`.
- `wishem/renderer-godot/remote-port`: the GDScript remote port closes the connection for the same malformed messages.

## Impact

- `nodejs/wishem/hub/LINK.md`: the rules of `welcome`, `result`, and "The numbers".
- `nodejs/wishem/hub/src/link/messages.ts` and `open-link.ts`, with their tests. The exported type `HubMessage` gets the welcome status `'created' | 'running'`.
- `nodejs/wishem/renderer-godot/godot/wishem/link_client.gd` and `link_messages.gd`, with their GDScript tests.
- The hub side sends no malformed message. A link between the hub side and a correct client does not change.
