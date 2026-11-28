---
issue: https://github.com/twin-digital/opus/issues/611
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

The hub side of the link drops a binary WebSocket message and sends no answer. A client that sends a binary message by mistake, for example a Godot client that uses `send` in place of `send_text`, gets no sign of the fault. The link stays open, and the client waits for a `welcome` that never comes.

## What Changes

- The hub side answers a binary message with `refused`, the reason `malformed`, and a text that names the cause. Then it closes the connection. This occurs before `welcome` and after `welcome`. After `welcome`, the hub side detaches each subsystem of the link, as for each other end of a link.
- The WebSocket channel of `hub` (`webSocketChannel`) reports a binary message to the hub side. A channel listener that does not ask for binary messages does not get them, so the client side (`openLink`) does not change.
- `hub/LINK.md` says that the hub side refuses a binary message. The table of the reasons of `refused` lists it under `malformed`.
- A test of `host-nodejs` sends a binary message on a real WebSocket to the server of the link.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/hub/link`: the hub side refuses a binary message with the reason `malformed` and closes the connection, and the document of the protocol says so.

## Impact

- `nodejs/wishem/hub/src/link/channel.ts`: the interface `Channel` gets an optional second listener of `onMessage` for a binary message. `webSocketChannel` uses it.
- `nodejs/wishem/hub/src/link/serve-link.ts`: the hub side registers the binary listener and refuses.
- `nodejs/wishem/hub/LINK.md`: "The kind of message", the section `refused`, and the reason table.
- `nodejs/wishem/host-nodejs/src/link-server.test.ts`: a test with a real `ws` client. The source of `host-nodejs` does not change.
- A client that sends only text messages sees no change.
