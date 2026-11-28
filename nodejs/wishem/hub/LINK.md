# The link protocol

This document defines the protocol of a link. A link connects a hub to the subsystems of a process that has no hub. The process can use any language. A client needs only this document, a WebSocket, and a JSON parser.

The current protocol version is 1.

## Terms

- **Hub side**: the program that holds the hub. It accepts the connection.
- **Client**: the program that holds the subsystems. It opens the connection.
- **Input subsystem**: a client subsystem that sends inputs.
- **Output subsystem**: a client subsystem that reads the joined state and listens to events. It sends no inputs.
- **Joined state**: a JSON object with one part for each model subsystem of the hub. The key of a part is the ID of its model subsystem.
- **Part**: the value of one key of the joined state. A part can be any JSON value.
- **Input**: a JSON object `{ "type": text, "payload": any JSON value }`. The key `payload` is optional.
- **Record**: the list of the inputs that the hub accepted. Each recorded input has a sequence number. The first number is 1.

## The connection

A link uses one connection. The connection carries text messages in order in each direction. The connection is a WebSocket.

Each message is one JSON object. The key `t` holds the type of the message. The value of `t` is text.

### The address

The program that holds the hub gives the address of the link. The package `host-nodejs` serves the link at `ws://127.0.0.1:<port>/link`.

A request with no `Origin` header is accepted. A client that is not a web browser, for example a game engine, usually sends no `Origin` header. A request that has an `Origin` header with a host other than `127.0.0.1`, `localhost`, or `[::1]` gets the HTTP status 403 before the WebSocket opens. The hub side sends no `refused` message in this case. A client that is not a web browser can send no `Origin` header, or an `Origin` header with one of these hosts.

### The kind of message

Send each message as a WebSocket text message. The hub side ignores a binary message and sends no answer. Example: in Godot, use `send_text`. Do not use `send` or `put_packet`.

### The size of a message

The protocol has no maximum size for a message. The message `welcome` holds the full joined state, so it can be large. Make the receive buffer of the WebSocket library large enough for the joined state. Example: `WebSocketPeer.inbound_buffer_size` of Godot has a default of 64 KiB.

### The numbers

Each number of version 1 is an integer from 0 to 2^53 - 1. This applies to `protocol`, `seq`, `request`, and the target of `hub/rewind`. A JSON parser that gives each number as a floating-point number (for example the parser of GDScript) can give `3.0` for `3`. Convert each such number to an integer before you compare it or send it.

### No keepalive

The hub side sends no WebSocket ping. The hub side has no time limit for `hello`. A client that must find a lost connection uses the ping of its WebSocket library.

## The messages

### Messages from the client to the hub side

#### `hello`

The client sends `hello` as the first message. It sends no other message before `welcome` arrives.

| Key          | JSON type | Meaning                                                     |
| ------------ | --------- | ----------------------------------------------------------- |
| `t`          | text      | `"hello"`                                                   |
| `protocol`   | number    | The protocol version of the client. Use 1.                  |
| `subsystems` | list      | The subsystems of the client. The list has 1 or more items. |

The ID of a subsystem has the form `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. A hyphen is never first, never last, and never next to another hyphen. The form has no maximum length.

Each item of `subsystems` is an object with two keys:

| Key    | JSON type | Meaning                                                                                                                                       |
| ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`   | text      | The ID of the subsystem. It starts with a lowercase letter. It has lowercase letters, digits, and single hyphens. No other subsystem uses it. |
| `kind` | text      | `"input"` or `"output"`.                                                                                                                      |

```json
{
  "t": "hello",
  "protocol": 1,
  "subsystems": [
    { "id": "page", "kind": "output" },
    { "id": "page-controls", "kind": "input" }
  ]
}
```

#### `submit`

The client sends `submit` to give an input to the hub. Only the ID of an input subsystem of this link is allowed.

| Key         | JSON type | Meaning                                                                    |
| ----------- | --------- | -------------------------------------------------------------------------- |
| `t`         | text      | `"submit"`                                                                 |
| `request`   | number    | The number of the request. The first number is 1. Add 1 for each `submit`. |
| `subsystem` | text      | The ID of the input subsystem that sends the input.                        |
| `input`     | object    | The input: `type` (text) and `payload` (any JSON value, optional).         |

```json
{
  "t": "submit",
  "request": 1,
  "subsystem": "page-controls",
  "input": { "type": "counter/add", "payload": { "by": 2 } }
}
```

### Messages from the hub side to the client

#### `welcome`

The hub side sends `welcome` as the first message after it accepts `hello`.

| Key        | JSON type | Meaning                                                                      |
| ---------- | --------- | ---------------------------------------------------------------------------- |
| `t`        | text      | `"welcome"`                                                                  |
| `protocol` | number    | The protocol version of this link. It is equal to `protocol` of the `hello`. |
| `status`   | text      | The status of the hub: `"created"` or `"running"`.                           |
| `seq`      | number    | The sequence number of the last accepted input. The value is 0 for no input. |
| `state`    | object    | The full joined state.                                                       |

The status `created` means that the hub did not start. The client then gets the `started` event later. A stopped hub sends `refused` with the reason `stopped`, and not `welcome`.

The client keeps `seq` and `state` of `welcome`. The number `seq` is the sequence number of the first state of the client. The first `applied` message has the number `seq` plus 1. A client that tells its program about the state gives `seq` to its program.

A `welcome` message is malformed when `state` is not an object or `seq` is not an integer. Close the connection, wait, and open a new link. See "A client that connects again".

```json
{ "t": "welcome", "protocol": 1, "status": "running", "seq": 3, "state": { "counter": { "count": 6 } } }
```

#### `refused`

The hub side sends `refused` when it cannot serve the `hello`. It then closes the connection. The hub side attaches none of the subsystems.

| Key         | JSON type | Meaning                                                |
| ----------- | --------- | ------------------------------------------------------ |
| `t`         | text      | `"refused"`                                            |
| `reason`    | text      | The reason. See the table below.                       |
| `message`   | text      | A text for a person. It says what is not correct.      |
| `supported` | list      | The supported protocol versions. Only for `"version"`. |

| Reason        | When it occurs                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `malformed`   | The first message is not `hello`. A message is not JSON. The list of subsystems is empty or not correct. A second `hello` arrives. |
| `version`     | The version of the client is not supported. Use a version of the list `supported`.                                                 |
| `id-in-use`   | A subsystem ID is in use by an other link or by the hub. The ID `hub` is always in use.                                            |
| `unsupported` | A subsystem has the kind `"model"`. Version 1 does not support it.                                                                 |
| `stopped`     | The hub is stopped.                                                                                                                |

```json
{
  "t": "refused",
  "reason": "version",
  "message": "The hub supports protocol version 1, not 2.",
  "supported": [1]
}
```

A client that gets `refused` counts it as a failed attempt. The attempt gets the wait of "A client that connects again". The reasons `version`, `unsupported`, and `malformed` show a defect in the client, and a new attempt gets the same answer. The reasons `id-in-use` and `stopped` can end later.

#### `event`

The hub side sends `event` for a change of the hub that has no input.

| Key     | JSON type | Meaning                      |
| ------- | --------- | ---------------------------- |
| `t`     | text      | `"event"`                    |
| `event` | text      | `"started"` or `"stopping"`. |

An `event` message with a value of `event` that is not `started` or `stopping` is malformed.

The event `started` means that the hub now accepts inputs. The event `stopping` means that the hub stops. The hub side closes the connection after it sends `stopping`.

```json
{ "t": "event", "event": "started" }
```

```json
{ "t": "event", "event": "stopping" }
```

#### `applied`

The hub side sends `applied` for each input that the hub accepts. It sends this message to all clients, also for the inputs of other clients.

| Key     | JSON type | Meaning                                                                        |
| ------- | --------- | ------------------------------------------------------------------------------ |
| `t`     | text      | `"applied"`                                                                    |
| `input` | object    | The recorded input. See the keys below.                                        |
| `parts` | object    | The new value of each part that changed. A key is the ID of a model subsystem. |

The keys of `input`:

| Key       | JSON type | Meaning                                                       |
| --------- | --------- | ------------------------------------------------------------- |
| `seq`     | number    | The sequence number of the input.                             |
| `source`  | text      | The ID of the subsystem that sent the input.                  |
| `type`    | text      | The type of the input.                                        |
| `payload` | any       | The payload of the input. The value is `null` for no payload. |

An `applied` message is malformed when `input` or `parts` is not an object, or when `seq` is not an integer. Close the connection and open a new link.

To update the joined state, replace each key of the local state with the key of `parts`. Keep each other part. The message holds no part that did not change.

```json
{
  "t": "applied",
  "input": { "seq": 4, "source": "page-controls", "type": "counter/add", "payload": { "by": 2 } },
  "parts": { "counter": { "count": 8 } }
}
```

#### `result`

The hub side sends `result` as the answer to one `submit`. The message has the key `result` or the key `error`, and not both.

| Key       | JSON type | Meaning                                                  |
| --------- | --------- | -------------------------------------------------------- |
| `t`       | text      | `"result"`                                               |
| `request` | number    | The number of the request of the `submit`.               |
| `result`  | object    | The result of the hub. See below.                        |
| `error`   | text      | The text of an error. The hub failed to apply the input. |

A `result` message is malformed when it has none of the keys `result` and `error`. The hub side sends one of the two keys. A `result` message whose `request` matches no `submit` is not malformed. Ignore it and keep the link open.

The key `result` has one of two forms:

- `{ "ok": true, "seq": number }`. The hub accepted the input. `seq` is its sequence number.
- `{ "ok": false, "reason": text, "problems": list }`. The hub rejected the input. The input changed nothing.

The reasons of a rejection:

| Reason          | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| `not-permitted` | The subsystem is not an input subsystem of this link.      |
| `not-running`   | The hub is not running.                                    |
| `unknown-type`  | No model subsystem applies this input type.                |
| `invalid`       | A model subsystem refused the input. `problems` tells why. |

Each item of `problems` is an object with a `message` (text) and an optional `path` (list of texts and numbers).

```json
{ "t": "result", "request": 1, "result": { "ok": true, "seq": 4 } }
```

```json
{
  "t": "result",
  "request": 2,
  "result": {
    "ok": false,
    "reason": "invalid",
    "problems": [{ "message": "The number is negative.", "path": ["payload", "by"] }]
  }
}
```

```json
{ "t": "result", "request": 3, "error": "The model subsystem failed." }
```

## The reserved ID and the input `hub/rewind`

The ID `hub` belongs to the hub. A subsystem of a client cannot use it. A `hello` with the ID `hub` gets `refused` with the reason `id-in-use`.

```json
{ "t": "refused", "reason": "id-in-use", "message": "A subsystem ID is in use." }
```

The input types that start with `hub/` belong to the hub. The hub applies them itself. No model subsystem gets them. The hub rejects an unknown type of this form with the reason `unknown-type`.

The input `hub/rewind` returns the joined state to the state after an earlier input. An input subsystem sends it with `submit`, as it sends each other input.

| Key       | JSON type | Meaning                                                                                               |
| --------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `type`    | text      | `"hub/rewind"`                                                                                        |
| `payload` | object    | `{ "seq": number }`. The target. The joined state becomes the state after the input with this number. |

The target is an integer. It is not before the first number that the hub keeps, and not after the last accepted input. The target 0 is the first state, when the hub still keeps it. A rewind to the last accepted input changes no part.

A rewind is an input. The hub records it with the next sequence number. The hub side sends it to each client as an `applied` message that holds the input `hub/rewind` and the parts that the hub side sends for it. The hub side sends each part that is not the same object as in the last state that it sent on this link. The client replaces each part that the message holds. A part in the message can have a value that is equal to the value that the client has. The sequence numbers go up by 1, as for each other input. The client uses the rules of `applied` and needs no other code. The link stays open.

When the target is not correct, the hub rejects the input. The `result` has the reason `invalid`, and `problems` names the path `["payload", "seq"]`. The hub accepts no input, so the sequence numbers do not change.

```json
{
  "t": "result",
  "request": 6,
  "result": {
    "ok": false,
    "reason": "invalid",
    "problems": [{ "message": "The target must be an integer from 0 to 5.", "path": ["payload", "seq"] }]
  }
}
```

## The rules of order

1. The client sends `hello` first. The hub side answers with `welcome` or `refused`.
2. After `welcome`, the hub side sends each event on the link one time. The client misses no event.
3. The `applied` messages have sequence numbers that go up by 1. The first `applied` message has the number `seq` of `welcome` plus 1.
4. When the client gets a sequence number that is not the last number plus 1, the client closes the connection and opens a new link.
5. The `applied` message of an input comes before the `result` message of the same input.
6. Each `submit` gets one `result`. Use the key `request` to find the matching `submit`. The results of different requests can arrive in a different order than the requests.

## Unknown messages and reserved types

After `welcome`, ignore each message that has an unknown type. Keep the link open. Do not send an error. A later version of the protocol can add types, and an older client still works. A later version does not send a new message type that changes the joined state or the sequence numbers to a client of an older version.

The types `apply` (hub side to client) and `part` (client to hub side) are reserved. A later version uses them for a model subsystem in the client. Version 1 does not send them. Ignore them.

Ignore unknown keys in a known message.

Before `welcome`, the first message from the hub side is `welcome` or `refused`. Close the connection for each other first message.

## The end of a link

A link ends when the connection closes. The hub side then detaches each subsystem of the link. Their IDs are free again. The hub continues.

When the connection closes, do this:

1. Keep the last joined state for reading. Do not change it.
2. Treat each `submit` that has no `result` as unknown. The hub can have accepted the input or not.
3. Open a new connection and send a new `hello`. The `welcome` message gives the full joined state.
4. Read the new joined state before you send an input again. Do not send an input again blindly. An input is not idempotent, and a second send can apply it two times.

A client that gets a malformed message or a wrong sequence number closes the connection and opens a new link. The hub side sends `refused` with the reason `malformed` for a malformed message, and closes the connection. That case is a defect in the client. Correct the client.

## A client that connects again

A client opens a new link after each end of a link. Do this:

1. Use new subsystem IDs for each link. A subsystem of an old link can still be attached while the hub side detaches it.
2. Wait 500 ms before the first new attempt. Double the wait after each failed attempt, up to 5 s. Wait 500 ms again after a `welcome`.
3. Send no input again after a link ends. See "The end of a link".

`connectLink` of `@thrashplay/wishem-hub` does these steps.

### The start of the wait

Start the first wait when the client finds that the connection is closed. A client that polls its connection starts the wait at the poll that finds the close. Count a `refused` message, and a malformed `welcome`, as a failed attempt.

## A full example

The hub has a model subsystem `counter` with one part: `{ "count": number }`. The hub accepted three inputs before the link starts. The count is 6.

1. The client sends `hello`.

```json
{
  "t": "hello",
  "protocol": 1,
  "subsystems": [
    { "id": "page", "kind": "output" },
    { "id": "page-controls", "kind": "input" }
  ]
}
```

2. The hub side answers with `welcome`. The last accepted input has the number 3.

```json
{ "t": "welcome", "protocol": 1, "status": "running", "seq": 3, "state": { "counter": { "count": 6 } } }
```

3. The subsystem `page-controls` sends an input that adds 2.

```json
{
  "t": "submit",
  "request": 1,
  "subsystem": "page-controls",
  "input": { "type": "counter/add", "payload": { "by": 2 } }
}
```

4. The hub side sends `applied` with the sequence number 4 and the new part.

```json
{
  "t": "applied",
  "input": { "seq": 4, "source": "page-controls", "type": "counter/add", "payload": { "by": 2 } },
  "parts": { "counter": { "count": 8 } }
}
```

5. The hub side sends `result` for the request.

```json
{ "t": "result", "request": 1, "result": { "ok": true, "seq": 4 } }
```

The sections above show the other messages: `event`, `refused`, a rejected `result`, and a failed `result`.

### A rewind

The hub accepted four inputs of `counter/add`, and the count is 8. The sequence number of the last input is 4. The subsystem `page-controls` rewinds to the input 2. The count was 4 after that input.

1. The subsystem `page-controls` sends the rewind.

```json
{
  "t": "submit",
  "request": 5,
  "subsystem": "page-controls",
  "input": { "type": "hub/rewind", "payload": { "seq": 2 } }
}
```

2. The hub side sends `applied` with the sequence number 5 and the changed part.

```json
{
  "t": "applied",
  "input": { "seq": 5, "source": "page-controls", "type": "hub/rewind", "payload": { "seq": 2 } },
  "parts": { "counter": { "count": 4 } }
}
```

3. The hub side sends `result` for the request.

```json
{ "t": "result", "request": 5, "result": { "ok": true, "seq": 5 } }
```
