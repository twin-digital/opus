# @thrashplay/wishem-renderer-godot

The Godot renderer of Wishem. The package holds a Godot project, a remote port of the link in GDScript, and the commands that run Godot in Docker.

## Godot runs only in Docker

No command installs Godot on your computer. Each command that needs Godot uses the image `wishem-godot:4.7.2-<12 hex digits>`.

- The image holds Godot 4.7.2, a virtual display (Xvfb), software OpenGL, and Node.js.
- The `Dockerfile` in `docker/` pins the base image and the SHA-512 sum of the Godot release.
- The tag changes when a file in `docker/` changes.
- A command builds the image when the Docker daemon does not have it.
- When `docker info` fails, a command prints a message and ends with exit code 1.

## Scripts

| Script        | Command                       | Docker | Purpose                                                 |
| ------------- | ----------------------------- | ------ | ------------------------------------------------------- |
| `godot:image` | `node scripts/godot.ts image` | Yes    | Build the image when it is missing.                     |
| `test`        | `opus-test`                   | No     | Run the Vitest tests of `src/`.                         |
| `test:godot`  | `node scripts/godot.ts test`  | Yes    | Run the GDScript tests in the image.                    |
| `test:ui`     | `pnpm test:godot`             | Yes    | Run the tests that need Docker (the CI job `ui-tests`). |

## GDScript tests

- Put each test file in `godot/tests/`. Name it `test_<topic>.gd`.
- Start the file with `extends "res://tests/check.gd"`.
- Name each test function `test_<behavior>`.
- Use `assert_equal(actual, expected, message)` and `assert_true(condition, message)`.
- `godot/tests/run.gd` runs each test and prints `PASS` or `FAIL` for each one, then `wishem-godot tests: <passed> passed, <failed> failed`.
- The runner ends with exit code 1 when a test fails or when it finds no test.

## The remote port in GDScript

The remote port opens a link to a hub in a Node.js process. It follows `nodejs/wishem/hub/LINK.md`, protocol version 1. Three files in `godot/wishem/` make it:

- `link_messages.gd`: static functions for the messages (`hello`, `submit`, `parse`, `is_id`, `new_id`, `as_int`).
- `link_client.gd`: opens the link, keeps the joined state, and opens a new link after each end.
- `remote_port.gd`: one port for each subsystem. It gives `read()`, `subscribe(listener)`, `submit(input)`, and `close()`.

The files use `preload` and no `class_name`. Load them with `preload("res://wishem/link_client.gd")`.

### Use

1. Make a `link_client.gd` with the options `url` and `subsystems`. Each subsystem is `{ "prefix": String, "kind": "input" | "output" }`.
2. Keep a reference to the client. Call `poll(Time.get_ticks_msec())` in `_process`.
3. Connect to the signals of the client.
4. Read the joined state with `read()`. Call `subscribe` for the events `started`, `applied`, and `stopping`.

| Signal                             | When                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `linked(ports)`                    | The hub side sent `welcome`. `ports` has one remote port for each subsystem, in order. |
| `down()`                           | One time for each period with no link. Each port keeps its last state.                 |
| `refused(reason: String, message)` | The hub side sent `refused`. One time for each period with no link.                    |

The client gets time only through `poll(now_ms)`. Other options: `socket_factory` (default `WebSocketPeer.new`), `first_delay_ms` (500), `max_delay_ms` (5000), and `inbound_buffer_size` (4194304). When the options are not correct, `error` has a text and the client opens no connection.

`submit(input)` gives a `Submission`. Check `done` first. Then connect to `finished(result)`, or read `result`. An output port gives `not-permitted`. A port with no link gives `not-running`. When the link ends before the result, `result` is `{ "error": "The link closed." }`. The client never sends the input again.

`close()` of the client or of a port closes the connection and opens no new link.

```gdscript
const LinkClient = preload("res://wishem/link_client.gd")

var _client: RefCounted


func _ready() -> void:
	_client = LinkClient.new({
		"url": "ws://127.0.0.1:4749/link",
		"subsystems": [{"prefix": "godot-screen", "kind": "output"}],
	})
	_client.linked.connect(_on_linked)


func _process(_delta: float) -> void:
	_client.poll(Time.get_ticks_msec())


func _on_linked(ports: Array) -> void:
	print(ports[0].read())
	ports[0].subscribe(func(event: Dictionary) -> void: print(event["type"]))
```

### The fixture of the link examples

`godot/tests/fixtures/link-examples.json` holds the messages of `examples.ts` of the hub. To write it again, run `node --conditions=source scripts/link-examples.ts`. The test `src/link-examples.test.ts` fails when the file is not equal to the examples.
