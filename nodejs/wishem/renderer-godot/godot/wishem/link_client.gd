extends RefCounted
## A client of the link (`hub/LINK.md`). It opens a link, keeps the joined state, and opens a new link after each end.
##
## Options: `url`, `subsystems` (a list of `{ "prefix": String, "kind": "input" | "output" }`),
## `socket_factory` (default `WebSocketPeer.new`), `first_delay_ms` (500), `max_delay_ms` (5000),
## and `inbound_buffer_size` (4194304). Call `poll(now_ms)` on each frame. Keep a reference to the client.

signal linked(ports: Array)
signal down
signal refused(reason: String, message: String)

const Messages = preload("res://wishem/link_messages.gd")
const RemotePort = preload("res://wishem/remote_port.gd")

enum Phase { WAITING, CONNECTING, AWAITING_WELCOME, LINKED, CLOSED }

## The text of the problem with the options. Empty when there is none. The client does nothing with a problem.
var error := ""

var _url: String
var _subsystems: Array
var _factory: Callable
var _first_delay: int
var _max_delay: int
var _buffer: int

var _phase := Phase.WAITING
var _now := 0
var _next_at := 0
var _delay: int
var _down_reported := false
var _refused_reported := false

var _socket: Variant = null
var _ids: Array[String] = []
var _link: RemotePort.LinkState = null
var _ports: Array = []
var _seq := 0
var _request := 0
var _pending := {}


func _init(options: Dictionary) -> void:
	_url = options.get("url", "")
	_subsystems = options.get("subsystems", [])
	_factory = options.get("socket_factory", WebSocketPeer.new)
	_first_delay = options.get("first_delay_ms", 500)
	_max_delay = options.get("max_delay_ms", 5000)
	_buffer = options.get("inbound_buffer_size", 4194304)
	_delay = _first_delay
	error = _problem()
	if not error.is_empty():
		_phase = Phase.CLOSED


## Moves the client forward. `now_ms` is a time in milliseconds that never goes back.
func poll(now_ms: int) -> void:
	_now = now_ms
	if _phase == Phase.CLOSED:
		return
	if _phase == Phase.WAITING:
		if _now < _next_at:
			return
		_attempt()
	if _socket != null:
		_service()


## Closes the connection. The client opens no new link and reports nothing after that.
func close() -> void:
	if _phase == Phase.CLOSED:
		return
	_phase = Phase.CLOSED
	_drop_socket(true)
	_release_link()


func _problem() -> String:
	if _url.is_empty():
		return "The remote port needs a URL."
	if _subsystems.is_empty():
		return "The remote port needs at least one subsystem."
	for subsystem: Variant in _subsystems:
		if typeof(subsystem) != TYPE_DICTIONARY:
			return "Each subsystem must be a dictionary."
		var item: Dictionary = subsystem
		if not Messages.is_id(str(item.get("prefix", ""))):
			return "The prefix of a subsystem is not valid."
		if not ["input", "output"].has(item.get("kind")):
			return "The kind of a subsystem must be input or output."
	return ""


func _attempt() -> void:
	_ids = []
	for subsystem: Dictionary in _subsystems:
		_ids.append(Messages.new_id(subsystem["prefix"]))
	var socket: Variant = _factory.call()
	socket.inbound_buffer_size = _buffer
	if socket.connect_to_url(_url) != OK:
		_fail()
		return
	_socket = socket
	_phase = Phase.CONNECTING


func _service() -> void:
	_socket.poll()
	var state: int = _socket.get_ready_state()
	if state == WebSocketPeer.STATE_CONNECTING:
		return
	if state == WebSocketPeer.STATE_OPEN and _phase == Phase.CONNECTING:
		_phase = Phase.AWAITING_WELCOME
		if _socket.send_text(JSON.stringify(Messages.hello(_hello_subsystems()))) != OK:
			_end_link(true)
			return
	_drain()
	if _socket != null and state == WebSocketPeer.STATE_CLOSED:
		_end_link(false)


func _hello_subsystems() -> Array:
	var items: Array = []
	for index in _subsystems.size():
		items.append({"id": _ids[index], "kind": _subsystems[index]["kind"]})
	return items


func _drain() -> void:
	while _socket != null and _socket.get_available_packet_count() > 0:
		var packet: PackedByteArray = _socket.get_packet()
		if _socket.was_string_packet():
			_handle(packet.get_string_from_utf8())


func _handle(text: String) -> void:
	var message := Messages.parse(text)
	if message.is_empty():
		_end_link(true)
	elif _phase == Phase.AWAITING_WELCOME:
		_handle_first(message)
	else:
		_handle_linked(message)


func _handle_first(message: Dictionary) -> void:
	if message["t"] == "welcome":
		_welcome(message)
	elif message["t"] == "refused":
		_refuse(message)
	else:
		_end_link(true)


func _welcome(message: Dictionary) -> void:
	var seq: Variant = Messages.as_int(message.get("seq"))
	if Messages.as_int(message.get("protocol")) != Messages.PROTOCOL or seq == null or typeof(message.get("state")) != TYPE_DICTIONARY:
		_end_link(true)
		return
	_seq = seq
	_link = RemotePort.LinkState.new(message["state"])
	_request = 0
	_pending = {}
	_delay = _first_delay
	_down_reported = false
	_refused_reported = false
	_phase = Phase.LINKED
	_ports = []
	for index in _subsystems.size():
		_ports.append(RemotePort.new(_link, _ids[index], _subsystems[index]["kind"], _send_submit, close))
	linked.emit(_ports)


func _refuse(message: Dictionary) -> void:
	_drop_socket(true)
	if not _refused_reported:
		_refused_reported = true
		refused.emit(str(message.get("reason", "")), str(message.get("message", "")))
	_fail()


func _handle_linked(message: Dictionary) -> void:
	match message["t"]:
		"applied":
			_apply(message)
		"event":
			_event(message)
		"result":
			_result(message)


func _apply(message: Dictionary) -> void:
	var input: Variant = message.get("input")
	var parts: Variant = message.get("parts")
	if typeof(input) != TYPE_DICTIONARY or typeof(parts) != TYPE_DICTIONARY:
		_end_link(true)
		return
	var recorded: Dictionary = (input as Dictionary).duplicate()
	var seq: Variant = Messages.as_int(recorded.get("seq"))
	if seq == null or seq != _seq + 1:
		_end_link(true)
		return
	_seq = seq
	recorded["seq"] = seq
	var state := _link.state.duplicate()
	for key: Variant in parts:
		state[key] = parts[key]
	_link.state = state
	_dispatch({"type": "applied", "input": recorded})


func _event(message: Dictionary) -> void:
	var name: Variant = message.get("event")
	if name == "started" or name == "stopping":
		_dispatch({"type": name})


func _result(message: Dictionary) -> void:
	var request: Variant = Messages.as_int(message.get("request"))
	if request == null or not _pending.has(request):
		return
	var outcome: Variant = message.get("result")
	var failure: Variant = message.get("error")
	var value: Dictionary
	if typeof(outcome) == TYPE_DICTIONARY:
		value = (outcome as Dictionary).duplicate()
		var seq: Variant = Messages.as_int(value.get("seq"))
		if seq != null:
			value["seq"] = seq
	elif typeof(failure) == TYPE_STRING:
		value = {"error": failure}
	else:
		return
	var submission: RemotePort.Submission = _pending[request]
	_pending.erase(request)
	submission.finish(value)


func _dispatch(event: Dictionary) -> void:
	for port: RemotePort in _ports.duplicate():
		if _phase != Phase.LINKED:
			return
		port.notify(event)


func _send_submit(subsystem: String, input: Dictionary, submission: RemotePort.Submission) -> void:
	if _phase != Phase.LINKED or _socket == null:
		submission.finish({"ok": false, "reason": "not-running", "problems": []})
		return
	_request += 1
	_pending[_request] = submission
	_socket.send_text(JSON.stringify(Messages.submit(_request, subsystem, input)))


## Ends the connection and waits for the next attempt. Reports `down` one time for each period with no link.
func _end_link(close_socket: bool) -> void:
	_drop_socket(close_socket)
	_release_link()
	_fail()


func _drop_socket(close_socket: bool) -> void:
	if _socket != null and close_socket:
		_socket.close()
	_socket = null


func _release_link() -> void:
	var pending := _pending
	_pending = {}
	_ports = []
	if _link != null:
		_link.ended = true
		_link = null
	for request: Variant in pending:
		(pending[request] as RemotePort.Submission).finish({"error": "The link closed."})


func _fail() -> void:
	if _phase == Phase.CLOSED:
		return
	_phase = Phase.WAITING
	_next_at = _now + _delay
	_delay = mini(_delay * 2, _max_delay)
	if not _down_reported:
		_down_reported = true
		down.emit()
