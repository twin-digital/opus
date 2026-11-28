extends Node
## The Godot application. It opens one link, draws the part `store`, and writes a screenshot after each new picture.
##
## Arguments after `--`: `--link <url>` and `--shots <folder>`.

const LinkClient = preload("res://wishem/link_client.gd")
const Renderer = preload("res://wishem/renderer.gd")
const Views = preload("res://wishem/views.gd")

const DEFAULT_LINK := "ws://127.0.0.1:4749/link"
const DEFAULT_SHOTS := "user://shots"
const PREFIX := "godot-screen"

var _client: RefCounted
var _make_renderer: Callable
var _take_shot: Callable
var _print: Callable
var _renderer: Variant = null
var _unsubscribe := Callable()
var _last_store: Variant = null
var _links := 0
var _shots := 0
var _shots_dir := DEFAULT_SHOTS


## Reads `--link` and `--shots` from the user arguments.
static func parse_args(args: PackedStringArray) -> Dictionary:
	var result := {"link": DEFAULT_LINK, "shots": DEFAULT_SHOTS}
	for index in args.size() - 1:
		if args[index] == "--link":
			result["link"] = args[index + 1]
		elif args[index] == "--shots":
			result["shots"] = args[index + 1]
	return result


## The options of the link client: one output subsystem.
static func client_options(url: String) -> Dictionary:
	return {"url": url, "subsystems": [{"prefix": PREFIX, "kind": "output"}]}


## Connects the application to a link client. The functions make the renderer of a port, take a shot, and print a line.
func start(client: RefCounted, url: String, make_renderer: Callable, take_shot: Callable, print_line: Callable) -> void:
	_client = client
	_make_renderer = make_renderer
	_take_shot = take_shot
	_print = print_line
	_client.linked.connect(_on_linked)
	_client.down.connect(_on_down)
	_print.call("wishem-godot: connecting to %s" % url)


func _ready() -> void:
	var args: Dictionary = parse_args(OS.get_cmdline_user_args())
	_shots_dir = args["shots"]
	DirAccess.make_dir_recursive_absolute(_shots_dir)
	var collected := Views.collect_views("res://views")
	for message: String in collected["errors"]:
		print("wishem-godot: %s" % message)
	var views: Dictionary = collected["views"]
	var client := LinkClient.new(client_options(args["link"]))
	start(
		client,
		args["link"],
		func(port: Variant) -> RefCounted:
			return Renderer.new(port, views, self, func() -> Vector2: return get_viewport().get_visible_rect().size),
		_shoot,
		print,
	)


func _process(_delta: float) -> void:
	_client.poll(Time.get_ticks_msec())


func _on_linked(ports: Array) -> void:
	_release()
	_links += 1
	_print.call("wishem-godot: connected (link %d)" % _links)
	var port: Variant = ports[0]
	_renderer = _make_renderer.call(port)
	_last_store = port.read().get("store")
	_unsubscribe = port.subscribe(func(_event: Dictionary) -> void: _on_event(port))
	_request_shot()


func _on_down() -> void:
	_print.call("wishem-godot: the hub is not reachable. Godot tries again.")


func _on_event(port: Variant) -> void:
	var store: Variant = port.read().get("store")
	if is_same(store, _last_store):
		return
	_last_store = store
	_request_shot()


func _release() -> void:
	if _unsubscribe.is_valid():
		_unsubscribe.call()
	_unsubscribe = Callable()
	if _renderer != null:
		_renderer.stop()
		_renderer = null


func _request_shot() -> void:
	_shots += 1
	_take_shot.call(_shots, _client.seq())


## Waits for the drawing, then writes the image of the viewport and prints the line of the shot.
func _shoot(number: int, seq: int) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var file := "%04d.png" % number
	var path := _shots_dir.path_join(file)
	if image.save_png(path) != OK:
		print("wishem-godot: cannot write %s" % path)
		return
	var center := image.get_pixel(image.get_width() / 2, image.get_height() / 2)
	print("wishem-godot: shot %d seq %d color #%s file %s" % [number, seq, center.to_html(false), path])
