extends RefCounted
## A fake `WebSocketPeer` and a harness that drives a link client with it.

const LinkClient = preload("res://wishem/link_client.gd")
const Messages = preload("res://wishem/link_messages.gd")

var ready_state := WebSocketPeer.STATE_CLOSED
var inbound_buffer_size := 65535
var buffer_at_connect := -1
var connect_result := OK
var urls: Array[String] = []
var sent: Array[String] = []
var close_count := 0
var _incoming: Array[String] = []


func connect_to_url(url: String, _options: Variant = null) -> int:
	buffer_at_connect = inbound_buffer_size
	urls.append(url)
	if connect_result != OK:
		return connect_result
	ready_state = WebSocketPeer.STATE_CONNECTING
	return OK


func poll() -> void:
	pass


func get_ready_state() -> int:
	return ready_state


func get_available_packet_count() -> int:
	return _incoming.size()


func get_packet() -> PackedByteArray:
	return _incoming.pop_front().to_utf8_buffer()


func was_string_packet() -> bool:
	return true


func send_text(text: String) -> int:
	sent.append(text)
	return OK


func close(_code: int = 1000, _reason: String = "") -> void:
	close_count += 1
	ready_state = WebSocketPeer.STATE_CLOSED


## The connection opens.
func open() -> void:
	ready_state = WebSocketPeer.STATE_OPEN


## The other side closes the connection.
func drop() -> void:
	ready_state = WebSocketPeer.STATE_CLOSED


func receive(message: Variant) -> void:
	_incoming.append(message if message is String else JSON.stringify(message))


func sent_messages() -> Array[Dictionary]:
	var messages: Array[Dictionary] = []
	for text in sent:
		messages.append(Messages.parse(text))
	return messages


## Drives a link client. Each fake socket the client makes is in `sockets`.
class Harness:
	extends RefCounted

	const DEFAULT_SUBSYSTEMS := [{"prefix": "page", "kind": "output"}, {"prefix": "page-controls", "kind": "input"}]

	var client: RefCounted
	var sockets: Array = []
	var now := 0
	var linked_events: Array = []
	var down_count := 0
	var refused_events: Array = []
	var connect_result := OK

	func _init(subsystems: Array = DEFAULT_SUBSYSTEMS, options: Dictionary = {}) -> void:
		var all := {"url": "ws://127.0.0.1:4749/link", "subsystems": subsystems, "socket_factory": _make_socket}
		all.merge(options, true)
		client = LinkClient.new(all)
		client.linked.connect(_on_linked)
		client.down.connect(_on_down)
		client.refused.connect(_on_refused)

	func _make_socket() -> RefCounted:
		var socket = load("res://tests/fake_socket.gd").new()
		socket.connect_result = connect_result
		sockets.append(socket)
		return socket

	func _on_linked(ports: Array) -> void:
		linked_events.append(ports)

	func _on_down() -> void:
		down_count += 1

	func _on_refused(reason: String, message: String) -> void:
		refused_events.append({"reason": reason, "message": message})

	func last_socket() -> RefCounted:
		return sockets.back()

	func poll_at(ms: int) -> void:
		now = ms
		client.poll(now)

	func step(ms: int) -> void:
		poll_at(now + ms)

	## Makes an attempt, opens the socket, and sends `hello`.
	func connect_socket() -> void:
		client.poll(now)
		last_socket().open()
		client.poll(now)

	func welcome(message: Dictionary = {}) -> void:
		var full := {"t": "welcome", "protocol": 1, "status": "running", "seq": 3, "state": {"counter": {"count": 6}, "time": {"ms": 0}}}
		full.merge(message, true)
		last_socket().receive(full)
		client.poll(now)

	## Makes an attempt and answers it with `welcome`. Gives the ports.
	func link(message: Dictionary = {}) -> Array:
		connect_socket()
		welcome(message)
		return linked_events.back()

	func receive(message: Variant) -> void:
		last_socket().receive(message)
		client.poll(now)

	func hello_of(socket: RefCounted) -> Dictionary:
		return socket.sent_messages()[0]
