extends RefCounted
## Draws the Godot views from the part `store` of a port. It reads and subscribes only. It never closes the port.
##
## It adds one `Control` to `root` and keeps one node in it for each drawn component.
## `views` is the table of `Views.collect_views`. `viewport_size` is a `Callable` that gives a `Vector2`.

const Views = preload("res://wishem/views.gd")

## The text of each error that the renderer wrote.
var errors: Array[String] = []

var _views: Dictionary
var _viewport_size: Callable
var _layer: Control
var _unsubscribe: Callable
var _store: Variant = null
var _entries := {}
var _failed := {}
var _stopped := false


func _init(port: Variant, views: Dictionary, root: Node, viewport_size: Callable) -> void:
	_views = views
	_viewport_size = viewport_size
	_layer = Control.new()
	root.add_child(_layer)
	_unsubscribe = port.subscribe(func(_event: Dictionary) -> void: _sync(port))
	_sync(port)


## Gives `{ "entity", "componentType" }` of the top visible node that holds the point, or an empty dictionary.
func entity_at(point: Vector2) -> Dictionary:
	if _stopped:
		return {}
	for index in range(_layer.get_child_count() - 1, -1, -1):
		var node := _layer.get_child(index)
		if not node is Control or not (node as Control).visible:
			continue
		if (node as Control).get_global_rect().has_point(point):
			var entry: Dictionary = _entries[node.get_instance_id()]
			return {"entity": entry["entity"], "componentType": entry["componentType"]}
	return {}


## Removes the listener and frees the nodes. A second call does nothing.
func stop() -> void:
	if _stopped:
		return
	_stopped = true
	_unsubscribe.call()
	_unsubscribe = Callable()
	_entries = {}
	_layer.free()


func _sync(port: Variant) -> void:
	if _stopped:
		return
	var store: Variant = (port.read() as Dictionary).get("store")
	if is_same(store, _store):
		return
	_store = store
	var wanted: Array = []
	if typeof(store) == TYPE_DICTIONARY:
		wanted = _wanted(store)
	var kept := {}
	for item: Dictionary in wanted:
		kept[item["key"]] = true
	_remove_others(kept)
	var viewport: Vector2 = _viewport_size.call()
	var position := 0
	for item: Dictionary in wanted:
		var node := _node_for(item)
		if node == null:
			continue
		item["view"].update(node, item["props"], viewport)
		_layer.move_child(node, position)
		position += 1


## One item for each component that has a view, in the order of the entities and then the definitions.
func _wanted(store: Dictionary) -> Array:
	var items: Array = []
	for entity: Dictionary in store.get("entities", []):
		for definition: Dictionary in store.get("definitions", []):
			var type: String = definition["id"]
			var components: Dictionary = entity.get("components", {})
			if not components.has(type) or not _views.has(type):
				continue
			items.append({
				"key": "%s:%s" % [entity["id"], type],
				"entity": entity["id"],
				"componentType": type,
				"view": _views[type]["view"],
				"props": Views.props(definition, components[type]),
			})
	return items


func _remove_others(kept: Dictionary) -> void:
	for id: int in _entries.keys():
		var entry: Dictionary = _entries[id]
		if not kept.has(entry["key"]):
			_entries.erase(id)
			_layer.remove_child(entry["node"])
			(entry["node"] as Node).free()
	for key: String in _failed.keys():
		if not kept.has(key):
			_failed.erase(key)


func _node_for(item: Dictionary) -> Node:
	for entry: Dictionary in _entries.values():
		if entry["key"] == item["key"]:
			return entry["node"]
	if _failed.has(item["key"]):
		return null
	var node: Variant = item["view"].create()
	if not node is Node:
		_failed[item["key"]] = true
		var message := "wishem: the view of the component type %s gave no node for the entity %s." % [item["componentType"], item["entity"]]
		errors.append(message)
		push_error(message)
		return null
	_layer.add_child(node)
	_entries[(node as Node).get_instance_id()] = {
		"key": item["key"],
		"entity": item["entity"],
		"componentType": item["componentType"],
		"node": node,
	}
	return node
