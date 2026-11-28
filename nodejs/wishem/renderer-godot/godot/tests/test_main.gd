extends "res://tests/check.gd"

const Main = preload("res://main.gd")
const Fake = preload("res://tests/fake_socket.gd")
const URL := "ws://127.0.0.1:4749/link"
const LOSS := "wishem-godot: the hub is not reachable. Godot tries again."


## A renderer that records `stop`.
class FakeRenderer:
	extends RefCounted
	var stopped := false

	func stop() -> void:
		stopped = true


## The main node, the harness, and the records of the fakes.
class Rig:
	extends RefCounted
	var main: Node
	var harness: RefCounted
	var lines: Array[String] = []
	var shots: Array = []
	var renderers: Array = []

	func _init() -> void:
		harness = Fake.Harness.new(Main.client_options(URL)["subsystems"])
		main = Main.new()
		main.start(harness.client, URL, _make_renderer, _take_shot, _print)

	func _make_renderer(_port: Variant) -> RefCounted:
		var renderer := FakeRenderer.new()
		renderers.append(renderer)
		return renderer

	func _take_shot(number: int, seq: int) -> void:
		shots.append({"number": number, "seq": seq})

	func _print(line: String) -> void:
		lines.append(line)

	func applied(seq: int, parts: Dictionary) -> void:
		harness.receive({"t": "applied", "input": {"seq": seq, "source": "clock", "type": "time/advance", "payload": null}, "parts": parts})

	## Drops the link and lets the client try again.
	func relink(message: Dictionary = {}) -> void:
		harness.last_socket().drop()
		harness.step(0)
		harness.step(10000)
		harness.link(message)

	func finish() -> void:
		main.free()


func _store(color: String) -> Dictionary:
	return {"definitions": [], "entities": [], "color": color}


func test_args_give_the_link_and_the_shots_folder() -> void:
	var args: Dictionary = Main.parse_args(PackedStringArray(["--link", URL, "--shots", "/out"]))
	assert_equal(args["link"], URL)
	assert_equal(args["shots"], "/out")


func test_args_have_defaults() -> void:
	var args: Dictionary = Main.parse_args(PackedStringArray())
	assert_equal(args["link"], URL)
	assert_equal(args["shots"], "user://shots")


func test_the_client_has_one_output_subsystem_with_the_prefix() -> void:
	var rig := Rig.new()
	rig.harness.connect_socket()
	var hello: Dictionary = rig.harness.hello_of(rig.harness.last_socket())
	assert_equal(hello["subsystems"].size(), 1)
	assert_equal(hello["subsystems"][0]["kind"], "output")
	assert_true(str(hello["subsystems"][0]["id"]).begins_with("godot-screen"), "the prefix")
	rig.finish()


func test_it_says_connecting() -> void:
	var rig := Rig.new()
	assert_equal(rig.lines, ["wishem-godot: connecting to %s" % URL] as Array[String])
	rig.finish()


func test_it_numbers_the_links() -> void:
	var rig := Rig.new()
	rig.harness.link()
	rig.relink()
	assert_equal(rig.lines.count("wishem-godot: connected (link 1)"), 1)
	assert_equal(rig.lines.count("wishem-godot: connected (link 2)"), 1)
	rig.finish()


func test_it_says_the_loss_one_time() -> void:
	var rig := Rig.new()
	rig.harness.link()
	rig.harness.last_socket().drop()
	rig.harness.step(0)
	rig.harness.step(10000)
	rig.harness.last_socket().drop()
	rig.harness.step(0)
	assert_equal(rig.lines.count(LOSS), 1)
	rig.finish()


func test_it_requests_a_shot_after_the_welcome_with_the_seq() -> void:
	var rig := Rig.new()
	rig.harness.link({"seq": 7, "state": {"store": _store("a")}})
	assert_equal(rig.shots, [{"number": 1, "seq": 7}])
	rig.finish()


func test_it_requests_a_shot_after_each_new_store() -> void:
	var rig := Rig.new()
	rig.harness.link({"seq": 0, "state": {"store": _store("a")}})
	rig.applied(1, {"store": _store("b")})
	rig.applied(2, {"store": _store("c")})
	assert_equal(rig.shots, [{"number": 1, "seq": 0}, {"number": 2, "seq": 1}, {"number": 3, "seq": 2}])
	rig.finish()


func test_it_requests_no_shot_when_the_store_stays_the_same() -> void:
	var rig := Rig.new()
	rig.harness.link({"seq": 0, "state": {"store": _store("a")}})
	rig.applied(1, {"time": {"ms": 500}})
	rig.harness.receive({"t": "event", "event": "started"})
	assert_equal(rig.shots.size(), 1)
	rig.finish()


func test_the_numbers_of_the_shots_continue_on_a_new_link() -> void:
	var rig := Rig.new()
	rig.harness.link({"seq": 0, "state": {"store": _store("a")}})
	rig.relink({"seq": 0, "state": {"store": _store("a")}})
	assert_equal(rig.shots.size(), 2)
	assert_equal(rig.shots[1]["number"], 2)
	rig.finish()


func test_the_old_renderer_stops_on_a_new_link() -> void:
	var rig := Rig.new()
	rig.harness.link()
	assert_equal(rig.renderers.size(), 1)
	assert_true(not rig.renderers[0].stopped, "the first renderer runs")
	rig.harness.last_socket().drop()
	rig.harness.step(0)
	assert_true(not rig.renderers[0].stopped, "the picture stays while the link is down")
	rig.harness.step(10000)
	rig.harness.link()
	assert_equal(rig.renderers.size(), 2)
	assert_true(rig.renderers[0].stopped, "the first renderer stops")
	assert_true(not rig.renderers[1].stopped, "the second renderer runs")
	rig.finish()


func test_it_sends_no_input() -> void:
	var rig := Rig.new()
	rig.harness.link({"state": {"store": _store("a")}})
	rig.applied(4, {"store": _store("b")})
	assert_equal(rig.harness.last_socket().sent.size(), 1, "only hello")
	rig.finish()
