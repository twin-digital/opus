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

## The Godot renderer and the Godot view

`godot/wishem/renderer.gd` draws Godot views from a port. It reads the part `store` of `port.read()` and listens with `port.subscribe`. It sends no input and it never closes the port.

### A view and its sidecar

A view is a GDScript file `<name>.gd` that extends `RefCounted`. It has two functions:

- `create() -> Node`: makes the node of one component. The renderer calls it one time for each component.
- `update(node: Node, props: Dictionary, viewport: Vector2) -> void`: sets the node from the props. The renderer calls it at each update with the size of the viewport.

The sidecar `<name>.view.json` attaches the view to a component type:

```json
{ "kind": "godot", "componentType": "ct_c47a0a86-b82f-43a8-8b0b-31a1e4ef6f37" }
```

`Views.collect_views(folder)` of `godot/wishem/views.gd` reads the sidecars of a folder. It gives `{ "views": { <ID>: { "sidecar", "view" } }, "errors": [String] }`. It ignores a sidecar of another kind. Each error names the file. The renderer draws no view that has an error. Two sidecars with one component type are an error, and neither view is drawn.

### The props

A view gets one prop for each field of the definition of its component type. `Views.field_name(label)` makes the name: it joins the words of the label in camel case (`Max health` gives `maxHealth`). A field with no value gives no prop. A label with no letter or digit gives no prop. For two fields with one name, the first field gives the value.

### Use

```gdscript
const Views = preload("res://wishem/views.gd")
const Renderer = preload("res://wishem/renderer.gd")

var views: Dictionary = Views.collect_views("res://views")["views"]
var renderer := Renderer.new(port, views, self, func() -> Vector2: return get_viewport_rect().size)
```

- The renderer adds one `Control` to the root node. It keeps one node for each component that has a view, in the order of the entities and then the definitions.
- It calls the views only when the part `store` is a different object. It makes the node of a new component. It removes and frees the node of a component that is gone.
- When `create` gives no node, the renderer writes one error with `push_error` and keeps the text in `renderer.errors`. The other views draw.

`entity_at(point)` gives `{ "entity": String, "componentType": String }` for the top visible `Control` that holds the point. It gives an empty dictionary when no visible node holds the point, and after `stop()`.

`stop()` removes the listener from the port and frees the nodes. It does not close the port. A second call does nothing.

### The view ClearColor

`godot/views/ClearColor.gd` makes a `ColorRect` that covers the viewport with the color of the prop `color`. The node is hidden when the prop has no value or is not a color.

### Add a view

1. Write `godot/views/<Name>.gd` with `create` and `update`.
2. Write `godot/views/<Name>.view.json` with the kind `godot` and the ID of the component type.
3. Write a test `godot/tests/test_<name>.gd`. Test `update` on a node that `create` makes.
4. Run `pnpm test:godot`.
