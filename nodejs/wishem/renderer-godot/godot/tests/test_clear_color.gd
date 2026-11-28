extends "res://tests/check.gd"

const Views = preload("res://wishem/views.gd")
const Renderer = preload("res://wishem/renderer.gd")
const FakePort = preload("res://tests/fake_port.gd")
const ClearColor = preload("res://views/ClearColor.gd")
const TYPE := "ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512"


func _updated(color: Variant, viewport: Vector2 = Vector2(640, 360)) -> ColorRect:
	var view := ClearColor.new()
	var node: ColorRect = view.create()
	view.update(node, {} if color == null else {"color": color}, viewport)
	return node


func _store(color: String) -> Dictionary:
	var definition := {"id": TYPE, "label": "Clear color", "fields": [{"id": "fld_color", "label": "Color", "type": "string"}]}
	return {"definitions": [definition], "entities": [{"id": "e1", "components": {TYPE: {"fld_color": color}}}]}


func test_the_sidecar_attaches_the_view_to_the_component_type() -> void:
	var result := Views.collect_views("res://views")
	assert_equal(result["errors"], [])
	assert_equal(result["views"].keys(), [TYPE])
	assert_equal(result["views"][TYPE]["sidecar"], "ClearColor.view.json")


func test_create_makes_a_color_rect() -> void:
	var node: Node = ClearColor.new().create()
	assert_true(node is ColorRect, "the node is a ColorRect")
	node.free()


func test_a_color_gives_a_visible_node_that_covers_the_viewport() -> void:
	var node := _updated("#b91c1c")
	assert_true(node.visible, "visible")
	assert_equal(node.position, Vector2.ZERO)
	assert_equal(node.size, Vector2(640, 360))
	assert_equal(node.color, Color.html("#b91c1c"))
	node.free()


func test_a_value_that_is_not_a_color_hides_the_node() -> void:
	var node := _updated("not a color")
	assert_true(not node.visible, "hidden")
	node.free()


func test_no_value_hides_the_node() -> void:
	var node := _updated(null)
	assert_true(not node.visible, "hidden")
	node.free()


func test_a_new_viewport_size_changes_the_node() -> void:
	var view := ClearColor.new()
	var node: ColorRect = view.create()
	view.update(node, {"color": "#b91c1c"}, Vector2(640, 360))
	view.update(node, {"color": "#b91c1c"}, Vector2(320, 180))
	assert_equal(node.size, Vector2(320, 180))
	assert_equal(node.position, Vector2.ZERO)
	node.free()


func test_a_valid_color_after_a_value_that_is_not_a_color_shows_the_node_again() -> void:
	var view := ClearColor.new()
	var node: ColorRect = view.create()
	view.update(node, {"color": "not a color"}, Vector2(640, 360))
	view.update(node, {"color": "#15803d"}, Vector2(640, 360))
	assert_true(node.visible, "visible")
	assert_equal(node.color, Color.html("#15803d"))
	node.free()


func test_the_renderer_draws_the_clear_color_and_gives_the_entity_at_a_point() -> void:
	var host := Node.new()
	(Engine.get_main_loop() as SceneTree).root.add_child(host)
	var views: Dictionary = Views.collect_views("res://views")["views"]
	var renderer := Renderer.new(FakePort.new({"store": _store("#b91c1c")}), views, host, func() -> Vector2: return Vector2(640, 360))
	assert_equal(host.get_child(0).get_child_count(), 1)
	assert_equal(renderer.entity_at(Vector2(10, 10)), {"entity": "e1", "componentType": TYPE})
	assert_equal(renderer.entity_at(Vector2(700, 10)), {})
	renderer.stop()
	host.free()
