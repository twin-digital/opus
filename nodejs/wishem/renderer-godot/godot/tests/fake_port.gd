extends RefCounted
## A port with `read` and `subscribe` that a test controls.

var state: Dictionary = {}
var closed := false
var _listeners: Array[Callable] = []


func _init(initial: Dictionary = {}) -> void:
	state = initial


func read() -> Dictionary:
	return state


func subscribe(listener: Callable) -> Callable:
	_listeners.append(listener)
	return func() -> void: _listeners.erase(listener)


func close() -> void:
	closed = true


func listener_count() -> int:
	return _listeners.size()


## Sets the part `store` and gives the event `applied` to each listener.
func apply(store: Dictionary) -> void:
	var next := state.duplicate()
	next["store"] = store
	state = next
	emit({"type": "applied"})


func emit(event: Dictionary) -> void:
	for listener in _listeners.duplicate():
		listener.call(event)
