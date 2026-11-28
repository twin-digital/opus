extends RefCounted
## One port of one link. The link client makes it. All ports of one link share one joined state.


## The answer to `submit`. `finished` comes once, with `result`. Check `done` first: a refusal is already `done`.
class Submission:
	extends RefCounted
	signal finished(result: Dictionary)
	var result: Dictionary = {}
	var done := false

	func finish(value: Dictionary) -> void:
		if done:
			return
		result = value
		done = true
		finished.emit(value)


## The state that the ports of one link share.
class LinkState:
	extends RefCounted
	var state: Dictionary = {}
	var ended := false

	func _init(initial: Dictionary) -> void:
		state = initial


## The ID of the subsystem of this port on the hub side.
var id: String
## `"input"` or `"output"`.
var kind: String

var _link: LinkState
var _send: Callable
var _close: Callable
var _listeners: Array[Callable] = []


func _init(link: LinkState, port_id: String, port_kind: String, send: Callable, close_link: Callable) -> void:
	_link = link
	id = port_id
	kind = port_kind
	_send = send
	_close = close_link


## Gives the joined state. After the link ends, it gives the last state.
func read() -> Dictionary:
	return _link.state


## Gives the function that removes the listener.
func subscribe(listener: Callable) -> Callable:
	_listeners.append(listener)
	return func() -> void: _listeners.erase(listener)


func submit(input: Dictionary) -> Submission:
	var submission := Submission.new()
	if kind != "input":
		submission.finish(_rejection("not-permitted"))
	elif _link.ended:
		submission.finish(_rejection("not-running"))
	else:
		_send.call(id, input, submission)
	return submission


## Closes the link of this port.
func close() -> void:
	_close.call()


## Gives the event to each listener, in the order of registration.
func notify(event: Dictionary) -> void:
	for listener in _listeners.duplicate():
		listener.call(event)


func _rejection(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "problems": []}
