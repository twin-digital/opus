---
issue: https://github.com/twin-digital/opus/issues/530
milestone: https://github.com/twin-digital/opus/milestone/15
---

# Proposal

## Why

A subsystem can run in a process that has no hub: a renderer in a web browser, or a renderer in Godot. Such a subsystem needs the same three operations that a port gives in the process of the hub. The page of the workbench gets snapshots through `GET /snapshots` now. That stream goes in one direction, it has no version, and it carries no input. The architecture is in [#527](https://github.com/twin-digital/opus/issues/527).

## What Changes

- A link: a protocol of JSON messages with a version number. It carries the ports of the subsystems of one process on one connection.
- The side of the hub: a function that serves one connection for a hub. It attaches the subsystems that the other side names, sends the joined state at the start, and then sends each event with the parts that changed.
- The remote port for TypeScript: a function that opens a link on a connection and gives one port for each subsystem. A remote port has the same interface as a port in the process of the hub.
- A connection is an abstract channel of text messages. The package gives a channel for a WebSocket of the web platform and a pair of channels in memory for tests.
- A document of the protocol that a person can follow to write a remote port in a different language.
- The protocol reserves the messages for a model subsystem in a remote process. The hub refuses such a subsystem in this version.

No process uses the link after this change. [#531](https://github.com/twin-digital/opus/issues/531) adds the WebSocket server and makes the page of the workbench use the remote port.

## Capabilities

### New Capabilities

- `wishem/hub/link`: the protocol between a hub and the subsystems of a different process: the start of a link, the messages, the versions, the errors, and the behavior of a remote port.

### Modified Capabilities

None.

## Impact

- `@thrashplay/wishem-hub`: new exports and a protocol document. No change to the exports of [#528](https://github.com/twin-digital/opus/issues/528).
- No new dependency. The code uses no Node.js API and no type of a web browser.
- Not in this change: a WebSocket server, a new connection after a failure, and a remote port in GDScript ([#541](https://github.com/twin-digital/opus/issues/541)).
