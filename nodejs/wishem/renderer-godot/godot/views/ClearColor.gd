extends RefCounted
## Fills the viewport with the color of the prop `color`. The node is hidden when the prop is not a color.


func create() -> Node:
	return ColorRect.new()


func update(node: Node, props: Dictionary, viewport: Vector2) -> void:
	var rect: ColorRect = node
	rect.position = Vector2.ZERO
	rect.size = viewport
	var color: Variant = props.get("color")
	if typeof(color) == TYPE_STRING and Color.html_is_valid(color):
		rect.color = Color.html(color)
		rect.visible = true
	else:
		rect.visible = false
