# @thrashplay/wishem-renderer-godot

The Godot renderer of Wishem. The package holds a Godot project, a remote port of the link in GDScript, and the commands that run Godot in Docker. The Godot application draws the sample construct. The package holds no construct.

## Godot runs only in Docker

No command installs Godot on your computer. Each command that needs Godot uses the image `wishem-godot:4.7.2-<12 hex digits>`.

- The image holds Godot 4.7.2, a virtual display (Xvfb), software OpenGL, and Node.js.
- The `Dockerfile` in `docker/` pins the base image and the SHA-512 sum of the Godot release.
- The tag changes when a file in `docker/` changes.
- A command builds the image when the Docker daemon does not have it.
- When `docker info` fails, a command prints a message and ends with exit code 1.

## Scripts

| Script        | Command                          | Docker | Purpose                                                 |
| ------------- | -------------------------------- | ------ | ------------------------------------------------------- |
| `godot`       | `node scripts/godot.ts run`      | Yes    | Run the Godot application in a container.               |
| `godot:image` | `node scripts/godot.ts image`    | Yes    | Build the image when it is missing.                     |
| `test`        | `opus-test`                      | No     | Run the Vitest tests of `src/`.                         |
| `test:godot`  | `node scripts/godot.ts test`     | Yes    | Run the GDScript tests in the image.                    |
| `test:ui`     | `test:godot`, then `node --test` | Yes    | Run the tests that need Docker (the CI job `ui-tests`). |

## GDScript tests

- Put each test file in `godot/tests/`. Name it `test_<topic>.gd`.
- Start the file with `extends "res://tests/check.gd"`.
- Name each test function `test_<behavior>`.
- Use `assert_equal(actual, expected, message)` and `assert_true(condition, message)`.
- `godot/tests/run.gd` runs each test and prints `PASS` or `FAIL` for each one, then `wishem-godot tests: <passed> passed, <failed> failed`.
- The runner ends with exit code 1 when a test fails or when it finds no test.
- `test:godot` reads each line of the output of Godot. When a line has `SCRIPT ERROR`, it prints `wishem-godot tests: SCRIPT ERROR in the output` and ends with exit code 1, also when Godot ends with exit code 0.
- A test that needs an invalid file writes it at run time into a folder under `user://` and removes the folder at the end. Do not commit an invalid file.

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
		"url": "ws://127.0.0.1:4750/link",
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
{ "kind": "godot", "componentType": "ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512" }
```

`Views.collect_views(folder)` of `godot/wishem/views.gd` reads the sidecars of a folder. It gives `{ "views": { <ID>: { "sidecar", "view" } }, "errors": [String] }`. It ignores a sidecar of another kind. Each error names the file. The renderer draws no view that has an error. Two sidecars with one component type are an error, and neither view is drawn.

### The props

A view gets one prop for each field of the definition of its component type. `Views.field_name(label)` makes the name: it joins the words of the label in camel case (`Max health` gives `maxHealth`). A field with no value gives no prop. A label with no letter or digit gives no prop, and the renderer writes one warning for it with `push_warning`: `wishem: the sidecar <sidecar>: the label of the field <field ID> of the component type <component type ID> gives an empty name. The view does not get the field.` The renderer writes the warnings again only when their text changes, and keeps each line in `renderer.warnings`. For two fields with one name, the first field gives the value.

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
- The renderer keeps the text of each warning that it wrote with `push_warning` in `renderer.warnings`.

`entity_at(point)` gives `{ "entity": String, "componentType": String }` for the top visible `Control` that holds the point. It gives an empty dictionary when no visible node holds the point, and after `stop()`.

`stop()` removes the listener from the port and frees the nodes. It does not close the port. A second call does nothing.

### The view ClearColor

`godot/views/ClearColor.gd` makes a `ColorRect` that covers the viewport with the color of the prop `color`. The node is hidden when the prop has no value or is not a color.

### Add a view

1. Write `godot/views/<Name>.gd` with `create` and `update`.
2. Write `godot/views/<Name>.view.json` with the kind `godot` and the ID of the component type.
3. Write a test `godot/tests/test_<name>.gd`. Test `update` on a node that `create` makes.
4. Run `pnpm test:godot`.

## The Godot application

The Godot application opens a link to the sample construct and draws it. The `Color` component type of `@thrashplay/wishem-sample-product` has the field `Color`. The view `ClearColor` draws it. `godot/main.gd` is the main scene. It opens one link with one output subsystem with the prefix `godot-screen`, and it sends no input.

### The command

```
pnpm --filter @thrashplay/wishem-renderer-godot godot [--hub-port <number>]
```

- The command runs the application in a container with a viewport of 640 by 360 pixels.
- `--hub-port` gives the port of the sample construct. The default is 4750.
- Start the sample construct with `pnpm --filter @thrashplay/wishem-three-renderers construct` in a second terminal. The application tries again until the construct runs.
- On `SIGINT` or `SIGTERM`, the command removes the container and ends with exit code 0.
- `runGodot(options)` gives the same run to a program.

### The lines

| Line                                                                          | When                                    |
| ----------------------------------------------------------------------------- | --------------------------------------- |
| `wishem-godot: connecting to <url>`                                           | The application starts.                 |
| `wishem-godot: connected (link <n>)`                                          | After each `welcome`. `n` starts at 1.  |
| `wishem-godot: the hub is not reachable. Godot tries again.`                  | One time for each loss of the link.     |
| `wishem-godot: shot <n> seq <seq> color <#rrggbb> file <absolute local path>` | After each picture that has a new part. |

### The screenshots

- After a `welcome` and after each new part `store`, the application writes the image of the viewport to a PNG file with a number that goes up by 1.
- The command copies each file to `shots/` of the package. The line gives the absolute path of the copy. It empties `shots/` at its start.
- `<#rrggbb>` is the pixel at the center of the image.
- An event that leaves the part `store` the same gives no screenshot.

### The runner carries the bytes of the link

The Docker daemon can be on a different computer (`DOCKER_HOST`). A container cannot reach `127.0.0.1` of the computer of the command. So the runner carries the bytes of the link:

1. The runner runs `docker exec -i <container> node /srv/relay.mjs <hub port>`.
2. The relay in the container listens on `127.0.0.1:<hub port>` and accepts one connection.
3. The relay sends the bytes of the connection to its standard output, and writes its standard input to the connection.
4. The runner connects to `127.0.0.1:<hub port>` on its own computer and carries the bytes in both directions.
5. When one side ends, the runner ends the other side and starts the next relay.

The limit: one connection at a time. For a short time between two connections, no relay listens, and the application tries again. The runner needs no published port and no change to the sample construct.

## The screenshot test

`tests/godot.ui.test.ts` runs the sample construct and the Godot application, and checks the pictures of the application.

### Run

The test needs Docker, because the application runs in the image. It needs no running construct: the test starts its own sample construct with `startSampleConstruct` of `tests/sample-construct.ts`, with the time paused.

```
pnpm --filter @thrashplay/wishem-renderer-godot test:godot
pnpm --filter @thrashplay/wishem-renderer-godot exec node --test "tests/*.test.ts"
pnpm --filter @thrashplay/wishem-renderer-godot test:ui
```

`test:ui` runs the first two commands in order. `node --test tests/` does not find the file, so give the pattern `tests/*.test.ts`. The test writes the pictures to `.out/test-shots/`.

### The two processes

- The sample construct runs in the Node.js process of the test, on a port that the system selects, with the time paused. The clock step is 500 milliseconds.
- The Godot application runs in a container through `runGodot`. The runner carries the bytes of the link.

### Steps

1. Start the sample construct.
2. Start the application. Wait for `connected (link 1)` and a shot with `seq 0`. Each pixel is `#1d4ed8`.
3. A link client of the test sends `time/advance` of 500. Wait for a shot with `seq 1`. Each pixel is `#b91c1c`, and the file differs from the first one.
4. Wait 1500 milliseconds. No new shot comes.
5. Close the construct. Wait for the line of the loss of the link.
6. Start a construct on the same port. Wait for `connected (link 2)` and a new shot with `seq 0`. Each pixel is `#1d4ed8`.
7. Close the runner. `docker ps -a` shows no container of the run.

### What the test proves

- The remote port, the renderer, the view `ClearColor`, the relay, and the order of the link work together: a fault in one of them fails a step.
- The application draws the state of the hub and each change of the state, and it draws no picture when the state is the same.
- The application connects again after the loss of the link and draws the new state.
- The runner leaves no container.
