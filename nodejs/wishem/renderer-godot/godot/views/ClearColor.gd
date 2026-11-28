extends RefCounted
## Fills the viewport with the prop `color` when it is `#rrggbb`, and with `#ff00ff` otherwise. The node is always visible.

const FALLBACK := "#ff00ff"

var _pattern := RegEx.create_from_string("^#[0-9a-fA-F]{6}\\z")


func create() -> Node:
	return ColorRect.new()


func update(node: Node, props: Dictionary, viewport: Vector2) -> void:
	var rect: ColorRect = node
	rect.position = Vector2.ZERO
	rect.size = viewport
	var color: Variant = props.get("color")
	var is_color := typeof(color) == TYPE_STRING and _pattern.search(color) != null
	rect.color = Color.html(color if is_color else FALLBACK)
	rect.visible = true
