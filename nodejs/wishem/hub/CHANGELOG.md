# @thrashplay/wishem-hub

## 0.1.0

### Minor Changes

- 5ea9a44: `connectLink` now uses the same subsystem IDs for each link, and makes new IDs only after a refusal with `id-in-use`.
- d823333: The option `rewindSources` of `createHub` limits which subsystems can send `hub/rewind`.
- ced6862: `connectLink` is a client of the link that opens a new link after each end.
- 52d739c: New package: the hub of a construct. `createHub` connects model subsystems and I/O subsystems in one process.
- b7d80d7: Add the link: `serveLink` and `openLink` carry the ports of the subsystems of one process to a hub in a different process, with a versioned protocol of JSON messages.
- 86b2e37: The hub keeps checkpoints and limits the length of the record with the options `checkpointInterval` and `recordLimit`. `Hub.recordStart()` gives the start of the record.
- 86b2e37: Add the option `record` of `createHub`, which applies a record in a new hub. A `ReplayError` names the input that does not apply.
- 86b2e37: The hub reserves the subsystem ID `hub` and the input types `hub/<name>`. A subsystem that uses one of them is refused.
- 86b2e37: Add the input `hub/rewind`, which returns a construct to its state after an earlier input. The rewind is one more input of the record, and its hub event is `applied`.
- 86b2e37: Add `Hub.seq`, the sequence number of the last accepted input.

### Patch Changes

- d107430: `LINK.md` gives the full protocol of the link: a malformed message closes the connection, and each gap that a second client found is closed.
- ea8b458: `webSocketChannel` rejects at once for a socket that is closing or closed.
- ea8b458: The link client ends the link for a `result` message with a `result` that is not a valid submit result: `ok: true` needs a `seq` that is an integer from 0 to 2^53 - 1, and `ok: false` needs a known `reason` and a list `problems`. `LINK.md` lists these rules as malformed messages. A new rejection reason needs a new protocol version.
- ea8b458: `webSocketChannel` closes the socket one time when the socket sends an `error` event after the open.
- ea8b458: A channel gives all waiting messages to a new listener, also when the listener throws for one of them. The first error goes to the caller of `onMessage`.
- b36bb42: The hub side of the link answers a binary message with `refused` and the reason `malformed`, and closes the connection.
- 68b689d: The reference client and the GDScript client close the link for malformed messages. `LINK.md` states the rules.
- 3adc5a1: The hub uses no type of Node.js, so a package with no Node.js types can import it.
- 64efce8: The hub side refuses a `hello` or a `submit` as malformed when `protocol` or `request` is not an integer from 0 to 2^53 - 1. The client side does not accept a `refused` message when a number of `supported` is not such an integer: it closes the link with the error "The hub side sent no welcome message."
- a6b3ba2: The tests of the link are stronger. The behavior does not change.
- 96c1755: Add a test for the accepted bounds of a supported version in a `refused` message.
- b19239f: Test every rejection reason and the type of `ok` in a hub `result` message.
- 24b02f3: The tests of the hub for the record limit, checkpoints, rewind, replay, and link are stronger. The package has no change of behavior.
- cbbd4e9: The tests of `connectLink` are stronger. The package has no change of behavior.
- 24fbcff: The tests of the option `rewindSources` are stronger. The package has no change of behavior.
- 3197928: The tests of the message reader of the link are stronger. The package has no change of behavior.
- b655a01: Strengthen the tests of the hub after a break-test with two passes. The package has no change of behavior.
