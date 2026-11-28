extends "res://tests/check.gd"

const Renderer = preload("res://wishem/renderer.gd")
const FakePort = preload("res://tests/fake_port.gd")
const Views = preload("res://wishem/views.gd")
const CT := "ct_00000000-0000-4000-8000-000000000001"
const OTHER := "ct_00000000-0000-4000-8000-000000000002"
const COLOR := "fld_color"
const SIZE := Vector2(640, 360)


## A view that makes a `ColorRect` for each component and records its calls.
class RectView:
	extends RefCounted
	var creates := 0
	var updates: Array = []
	var gives_node := true
	var visible := true
	var rect_size := Vector2(100, 100)

	func create() -> Node:
		creates += 1
		return ColorRect.new() if gives_node else null

	func update(node: Node, props: Dictionary, viewport: Vector2) -> void:
		updates.append({"node": node, "props": props, "viewport": viewport})
		var rect: ColorRect = node
		rect.visible = visible
		rect.size = rect_size
		rect.position = Vector2.ZERO


func _definition(id: String = CT, label: String = "Thing") -> Dictionary:
	return {"id": id, "label": label, "fields": [{"id": COLOR, "label": "Color", "type": "string"}]}


func _entity(id: String, components: Dictionary) -> Dictionary:
	return {"id": id, "components": components}


func _store(entities: Array, definitions: Array = [_definition()]) -> Dictionary:
	return {"definitions": definitions, "entities": entities}


func _table(view: Object, type: String = CT) -> Dictionary:
	return {type: {"sidecar": "X.view.json", "view": view}}


func _host() -> Node:
	var node := Node.new()
	(Engine.get_main_loop() as SceneTree).root.add_child(node)
	return node


func _size() -> Vector2:
	return SIZE


func _children(host: Node) -> Array:
	return host.get_child(0).get_children()


func test_draws_at_once_from_the_state_of_the_port() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {COLOR: "#112233"}})])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	assert_equal(view.creates, 1)
	assert_equal(_children(host).size(), 1)
	assert_equal(view.updates[0]["props"], {"color": "#112233"})
	assert_equal(view.updates[0]["viewport"], SIZE)
	renderer.stop()
	host.free()


func test_a_field_change_keeps_the_node_and_gives_the_new_value() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {COLOR: "#111111"}})])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	var before: Node = _children(host)[0]
	port.apply(_store([_entity("e1", {CT: {COLOR: "#222222"}})]))
	assert_equal(_children(host).size(), 1)
	assert_true(is_same(_children(host)[0], before), "the node is the same object")
	assert_equal(view.creates, 1)
	assert_equal(view.updates.size(), 2)
	assert_equal(view.updates[1]["props"], {"color": "#222222"})
	assert_true(is_same(view.updates[1]["node"], before), "update gets the same node")
	renderer.stop()
	host.free()


func test_an_event_with_the_same_store_calls_no_view() -> void:
	var host := _host()
	var view := RectView.new()
	var store := _store([_entity("e1", {CT: {COLOR: "#111111"}})])
	var port := FakePort.new({"store": store})
	var renderer := Renderer.new(port, _table(view), host, _size)
	port.emit({"type": "applied"})
	port.emit({"type": "started"})
	assert_equal(view.updates.size(), 1)
	assert_equal(view.creates, 1)
	renderer.stop()
	host.free()


func test_a_removed_entity_leaves_the_tree_and_is_freed() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {}}), _entity("e2", {CT: {}})])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	var gone: Node = _children(host)[0]
	var kept: Node = _children(host)[1]
	port.apply(_store([_entity("e2", {CT: {}})]))
	assert_true(not is_instance_valid(gone), "the node is freed")
	assert_equal(_children(host), [kept])
	renderer.stop()
	host.free()


func test_a_new_entity_gives_one_new_node_in_the_order_of_the_entities() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {}}), _entity("e3", {CT: {}})])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	var first: Node = _children(host)[0]
	var last: Node = _children(host)[1]
	port.apply(_store([_entity("e1", {CT: {}}), _entity("e2", {CT: {}}), _entity("e3", {CT: {}})]))
	var nodes := _children(host)
	assert_equal(nodes.size(), 3)
	assert_equal(view.creates, 3)
	assert_true(is_same(nodes[0], first) and is_same(nodes[2], last), "the old nodes keep their objects")
	assert_true(not is_same(nodes[1], first) and not is_same(nodes[1], last), "the new node is in the middle")
	renderer.stop()
	host.free()


func test_the_nodes_follow_the_entities_and_then_the_definitions() -> void:
	var host := _host()
	var view := RectView.new()
	var other := RectView.new()
	var table := _table(view)
	table.merge(_table(other, OTHER))
	var store := _store(
		[_entity("e1", {CT: {}, OTHER: {}}), _entity("e2", {CT: {}, OTHER: {}})],
		[_definition(OTHER, "Other"), _definition(CT)],
	)
	var renderer := Renderer.new(FakePort.new({"store": store}), table, host, _size)
	var nodes := _children(host)
	assert_equal(nodes.size(), 4)
	assert_true(is_same(other.updates[0]["node"], nodes[0]), "e1, other")
	assert_true(is_same(view.updates[0]["node"], nodes[1]), "e1, thing")
	assert_true(is_same(other.updates[1]["node"], nodes[2]), "e2, other")
	assert_true(is_same(view.updates[1]["node"], nodes[3]), "e2, thing")
	renderer.stop()
	host.free()


func test_draws_no_component_of_a_type_with_no_view() -> void:
	var host := _host()
	var view := RectView.new()
	var store := _store([_entity("e1", {CT: {}, OTHER: {}})], [_definition(), _definition(OTHER, "Other")])
	var renderer := Renderer.new(FakePort.new({"store": store}), _table(view), host, _size)
	assert_equal(_children(host).size(), 1)
	renderer.stop()
	host.free()


func test_a_create_with_no_node_gives_one_error_and_the_other_views_draw() -> void:
	var host := _host()
	var bad := RectView.new()
	bad.gives_node = false
	var good := RectView.new()
	var table := _table(bad)
	table.merge(_table(good, OTHER))
	var store := _store([_entity("e1", {CT: {}, OTHER: {}})], [_definition(), _definition(OTHER, "Other")])
	var port := FakePort.new({"store": store})
	var renderer := Renderer.new(port, table, host, _size)
	assert_equal(_children(host).size(), 1)
	assert_equal(renderer.errors.size(), 1)
	assert_equal(good.updates.size(), 1)
	assert_equal(bad.updates.size(), 0)
	port.apply(_store(store["entities"].duplicate(), store["definitions"]))
	assert_equal(renderer.errors.size(), 1)
	renderer.stop()
	host.free()


func test_a_state_with_no_store_gives_no_node_and_no_error() -> void:
	var host := _host()
	var view := RectView.new()
	var renderer := Renderer.new(FakePort.new({"other": {}}), _table(view), host, _size)
	assert_equal(_children(host).size(), 0)
	assert_equal(renderer.errors, [])
	assert_equal(renderer.warnings, [])
	assert_equal(view.creates, 0)
	renderer.stop()
	host.free()


func test_entity_at_gives_the_top_visible_node() -> void:
	var host := _host()
	var view := RectView.new()
	var store := _store([_entity("e1", {CT: {}}), _entity("e2", {CT: {}})])
	var renderer := Renderer.new(FakePort.new({"store": store}), _table(view), host, _size)
	assert_equal(renderer.entity_at(Vector2(10, 10)), {"entity": "e2", "componentType": CT})
	renderer.stop()
	host.free()


func test_entity_at_skips_a_hidden_node() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {}}), _entity("e2", {CT: {}})])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	(view.updates[1]["node"] as CanvasItem).visible = false
	assert_equal(renderer.entity_at(Vector2(10, 10)), {"entity": "e1", "componentType": CT})
	(view.updates[0]["node"] as CanvasItem).visible = false
	assert_equal(renderer.entity_at(Vector2(10, 10)), {})
	renderer.stop()
	host.free()


func test_entity_at_gives_no_value_for_a_point_outside() -> void:
	var host := _host()
	var view := RectView.new()
	var store := _store([_entity("e1", {CT: {}})])
	var renderer := Renderer.new(FakePort.new({"store": store}), _table(view), host, _size)
	assert_equal(renderer.entity_at(Vector2(100, 100)), {})
	assert_equal(renderer.entity_at(Vector2(99, 99)), {"entity": "e1", "componentType": CT})
	assert_equal(renderer.entity_at(Vector2(-1, 5)), {})
	renderer.stop()
	host.free()


func test_after_stop_the_nodes_are_freed_and_entity_at_gives_no_value() -> void:
	var host := _host()
	var view := RectView.new()
	var renderer := Renderer.new(FakePort.new({"store": _store([_entity("e1", {CT: {}})])}), _table(view), host, _size)
	var node: Node = view.updates[0]["node"]
	renderer.stop()
	assert_true(not is_instance_valid(node), "the node is freed")
	assert_equal(host.get_child_count(), 0)
	assert_equal(renderer.entity_at(Vector2(10, 10)), {})
	host.free()


func test_stop_two_times_does_nothing() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	renderer.stop()
	renderer.stop()
	assert_equal(port.listener_count(), 0)
	assert_equal(host.get_child_count(), 0)
	host.free()


func test_an_event_after_stop_calls_no_view() -> void:
	var host := _host()
	var view := RectView.new()
	var port := FakePort.new({"store": _store([])})
	var renderer := Renderer.new(port, _table(view), host, _size)
	renderer.stop()
	port.apply(_store([_entity("e1", {CT: {}})]))
	assert_equal(view.creates, 0)
	assert_equal(view.updates.size(), 0)
	assert_equal(host.get_child_count(), 0)
	assert_equal(renderer.errors, [])
	host.free()


func test_the_port_has_a_listener_while_running_and_none_after_stop_and_stays_open() -> void:
	var host := _host()
	var port := FakePort.new({"store": _store([])})
	var renderer := Renderer.new(port, {}, host, _size)
	assert_equal(port.listener_count(), 1)
	renderer.stop()
	assert_equal(port.listener_count(), 0)
	assert_true(not port.closed, "the port is not closed")
	host.free()


func test_the_viewport_size_comes_from_the_callable_at_each_update() -> void:
	var host := _host()
	var view := RectView.new()
	var size := [Vector2(640, 360)]
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {}})])})
	var renderer := Renderer.new(port, _table(view), host, func() -> Vector2: return size[0])
	size[0] = Vector2(320, 180)
	port.apply(_store([_entity("e1", {CT: {COLOR: "x"}})]))
	assert_equal(view.updates[0]["viewport"], Vector2(640, 360))
	assert_equal(view.updates[1]["viewport"], Vector2(320, 180))
	renderer.stop()
	host.free()


func _warning_line(field: String) -> String:
	return "wishem: the sidecar Box.view.json: the label of the field %s of the component type %s gives an empty name. The view does not get the field." % [field, CT]


func _two_field_definition() -> Dictionary:
	return {"id": CT, "label": "Thing", "fields": [{"id": COLOR, "label": "Color", "type": "string"}, {"id": "fld_bad", "label": "???", "type": "string"}]}


func _box_table(view: Object) -> Dictionary:
	var table: Dictionary = Views.collect_from("res://tests/views/ok", ["Box.view.json"])["views"]
	table[CT]["view"] = view
	return table


func test_warns_for_a_label_with_an_empty_name_and_draws() -> void:
	var host := _host()
	var view := RectView.new()
	var entity := _entity("e1", {CT: {COLOR: "#111111", "fld_bad": "x"}})
	var port := FakePort.new({"store": _store([entity], [_two_field_definition()])})
	var renderer := Renderer.new(port, _box_table(view), host, _size)
	var line := _warning_line("fld_bad")
	assert_equal(renderer.warnings, [line])
	assert_equal(view.updates[0]["props"], {"color": "#111111"})
	port.apply(_store([_entity("e1", {CT: {COLOR: "#222222", "fld_bad": "x"}})], [_two_field_definition()]))
	assert_equal(renderer.warnings, [line], "a changed value writes no line")
	port.apply(_store([_entity("e1", {CT: {COLOR: "#222222"}})]))
	assert_equal(renderer.warnings, [line], "a definition with no problem writes no line")
	port.apply(_store([_entity("e1", {CT: {COLOR: "#222222"}})], [_two_field_definition()]))
	assert_equal(renderer.warnings, [line, line], "the problem again writes the line again")
	renderer.stop()
	host.free()


func test_warns_for_a_component_type_with_no_component() -> void:
	var host := _host()
	var port := FakePort.new({"store": _store([], [_two_field_definition()])})
	var renderer := Renderer.new(port, _box_table(RectView.new()), host, _size)
	assert_equal(renderer.warnings, [_warning_line("fld_bad")])
	renderer.stop()
	host.free()


func test_writes_no_warning_for_a_model_with_no_problem() -> void:
	var host := _host()
	var port := FakePort.new({"store": _store([_entity("e1", {CT: {COLOR: "#112233"}})])})
	var renderer := Renderer.new(port, _table(RectView.new()), host, _size)
	assert_equal(renderer.warnings, [])
	renderer.stop()
	host.free()


func test_warns_for_a_sidecar_with_no_definition_and_draws_the_other_views() -> void:
	var host := _host()
	var table: Dictionary = Views.collect_from("res://tests/views/ok", ["Box.view.json", "Ring.view.json"])["views"]
	var port := FakePort.new({"store": _store([_entity("e1", {OTHER: {COLOR: "a"}})], [_definition(OTHER)])})
	var renderer := Renderer.new(port, table, host, _size)
	var line := "wishem: the sidecar Box.view.json names the component type %s, which no definition has. No view is drawn for it." % CT
	assert_equal(renderer.warnings, [line])
	assert_equal(_children(host).size(), 1)
	port.apply(_store([_entity("e1", {OTHER: {COLOR: "b"}})], [_definition(OTHER)]))
	assert_equal(renderer.warnings, [line], "a changed value writes no line")
	port.apply(_store([_entity("e1", {OTHER: {COLOR: "b"}, CT: {COLOR: "c"}})], [_definition(OTHER), _definition(CT, "Color")]))
	assert_equal(renderer.warnings, [line], "a new definition writes no line")
	assert_equal(_children(host).size(), 2)
	renderer.stop()
	host.free()
