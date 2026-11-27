# @thrashplay/wishem-hub

The hub of a Wishem construct. It joins the parts of the model subsystems into the joined state, applies the inputs, and keeps the record of the accepted inputs.

The package uses no Node.js API and no browser API. The command `pnpm build --filter @thrashplay/wishem-hub` fails when a source file uses a Node.js module or global.

## The hub

A hub holds the joined state of one construct. The joined state has one part for each model subsystem, under the ID of the subsystem. A part is immutable. A model subsystem returns a new object for a part that changed, and the same object for a part that did not change.

The code that makes the hub gives it an ordered list of model subsystems. The hub starts one time and stops one time. It accepts inputs only between the start and the stop.

## The record

The record has a start and a list of inputs. The start is a checkpoint: a sequence number and the joined state after the input with that number. For a new hub, the start is `{ seq: 0, state }` with the first joined state. The list holds each accepted input after the start, in the order of the sequence numbers, with no gap.

- `hub.record()` returns the inputs after the start.
- `hub.recordStart()` returns the start.
- `hub.seq` returns the sequence number of the last accepted input, or 0. A read does not copy the record.

The hub keeps a checkpoint at the start and after each input whose sequence number is a multiple of `checkpointInterval`. The default is 100. A checkpoint refers to the parts of the joined state and copies none.

The option `recordLimit` is the largest number of inputs after the start. The default is 100000. After an accepted input, when the list holds more inputs than the limit, the hub moves the start to the first valid checkpoint in range. It removes the inputs up to that checkpoint and the checkpoints before it. `createHub` throws a `HubConfigurationError` when an option is not a positive integer, or when `recordLimit` is smaller than `checkpointInterval`.

## Reserved names

The ID `hub` and the input types `hub/<name>` belong to the hub. `createHub` throws a `HubConfigurationError` for a model subsystem with the ID `hub` or with a declared type that starts with `hub/`. `attach` throws a `HubConfigurationError` for the ID `hub`. The constants `HUB_ID` and `REWIND_INPUT_TYPE` give the reserved ID and the reserved type `hub/rewind`.

## The three kinds of subsystem

- **Model subsystem.** It owns one part of the joined state. It declares the input types that it applies, and it returns the new part for each input. It gets no port, so it cannot send an input. The list of model subsystems is fixed when the hub is made.
- **Input subsystem.** It attaches to the hub and gets a port. It sends inputs through the port.
- **Output subsystem.** It attaches to the hub and gets a port. It reads the joined state and listens to events. Its port rejects each input with the reason `not-permitted`.

An I/O subsystem can attach at any time before the hub stops. When it closes its port, the ID is free again.

## The port

A port has these operations:

- `submit(input)` sends an input. It returns a promise of a result.
- `read()` returns the joined state.
- `subscribe(listener)` registers a listener. It returns a function that removes the listener.
- `close()` closes the port.

The events are `started`, `applied`, and `stopping`. The `applied` event holds the recorded input. A listener calls `read()` to get the joined state after that input.

The hub calls the ports in the order of attachment. It calls the listeners of one port in the order of registration. The option `onError` gets each error that a listener throws. The default `onError` does nothing.

## The path of an input

1. An input subsystem sends an input through its port.
2. The hub puts the input in a queue when it applies an input or calls listeners. Otherwise it applies the input at once.
3. The hub finds the model subsystems that declare the type of the input. It rejects the input with `unknown-type` when it finds none.
4. The hub gives the input to each of these model subsystems in the order of the list. A model subsystem can refuse the input with `InputRefusedError`. The result is then `invalid`.
5. The hub gives the input a sequence number and adds it to the record. The payload is a frozen JSON copy.
6. The hub sends the `applied` event to the listeners.
7. The promise of `submit` resolves with `{ ok: true, seq }` or with a rejection.

A rejected input changes nothing and causes no event. When a model subsystem throws an error that is not a refusal, the hub changes nothing and rejects the promise with that error.

## Example

```ts
import { createHub, type ModelSubsystem } from '@thrashplay/wishem-hub'

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
}

const hub = createHub({ subsystems: [counter] })
const buttons = hub.attach({ id: 'buttons', kind: 'input' })
const screen = hub.attach({ id: 'screen', kind: 'output' })
const shown: unknown[] = []
screen.subscribe((event) => {
  if (event.type === 'applied') {
    shown.push(screen.read().counter)
  }
})
hub.start()
const accepted = await buttons.submit({ type: 'counter/add', payload: { by: 2 } })
const refused = await screen.submit({ type: 'counter/add', payload: { by: 2 } })

// accepted: { ok: true, seq: 1 }
// refused: { ok: false, reason: 'not-permitted', problems: [] }
// shown: [{ count: 2 }]
```

## The link

A link connects a hub to the subsystems of a process that has no hub. The process can be a browser page, a game, or a program in a different language. The protocol uses JSON text messages on one connection. `LINK.md` defines each message. A person who writes a client in any language needs only that document.

- `serveLink(hub, channel)` is the hub side. It attaches the subsystems of the client to the hub and sends each event one time.
- `openLink(channel, subsystems, options)` is the client side in TypeScript. It resolves with a `RemoteLink`. A `RemoteLink` has one remote port for each subsystem, `closed`, and `close()`.
- A remote port has the operations of a port. `read()` returns the last joined state with no wait.
- `openLink` rejects with a `LinkRefusedError` when the hub side refuses the `hello`. It rejects with a `LinkClosedError` when the channel closes first.
- When the link ends, each `submit` that waits fails with a `LinkClosedError`. Each later `submit` gives `not-running`. `read()` keeps the last joined state.
- The option `onError` gets each error that a listener throws.
- A channel is the connection. `createChannelPair()` makes two connected channels in memory. `webSocketChannel(socket)` makes a channel from a WebSocket.

```ts
import { createChannelPair, createHub, openLink, serveLink, type ModelSubsystem } from '@thrashplay/wishem-hub'

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
}

const hub = createHub({ subsystems: [counter] })
hub.start()

const [clientChannel, hubChannel] = createChannelPair()
serveLink(hub, hubChannel)
const link = await openLink(clientChannel, [
  { id: 'screen', kind: 'output' },
  { id: 'buttons', kind: 'input' },
])
const shown: unknown[] = []
link.ports.screen.subscribe((event) => {
  if (event.type === 'applied') {
    shown.push(link.ports.screen.read().counter)
  }
})
const accepted = await link.ports.buttons.submit({ type: 'counter/add', payload: { by: 2 } })

// accepted: { ok: true, seq: 1 }
// shown: [{ count: 2 }]
```

The test `src/readme-example.test.ts` runs both examples.
