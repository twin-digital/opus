extends RefCounted
## The warnings about the views and the definitions, as dictionaries and as lines. Static functions with no state.

const Views = preload("res://wishem/views.gd")


## One dictionary for each warning: `{ "kind", "sidecar", "componentType", "fields"?, "name"? }`.
## Sorted by sidecar, component type, name, kind, and then the position before the sort.
static func view_warnings(views: Dictionary, definitions: Array) -> Array:
	var by_id := {}
	for definition: Dictionary in definitions:
		by_id[definition["id"]] = definition
	var warnings: Array = []
	for type: String in views:
		if not by_id.has(type):
			continue
		var sidecar: String = views[type]["sidecar"]
		for problem: Dictionary in Views.prop_names(by_id[type])["problems"]:
			if problem["kind"] == "empty-name":
				warnings.append({"kind": "empty-name", "sidecar": sidecar, "componentType": type, "fields": [problem["field"]]})
	var ranked: Array = []
	for index in warnings.size():
		ranked.append({"warning": warnings[index], "index": index})
	ranked.sort_custom(_before)
	return ranked.map(func(item: Dictionary) -> Dictionary: return item["warning"])


## One line, with the text of `describeWarning` of renderer-react.
static func describe_warning(warning: Dictionary) -> String:
	var fields: Array = warning.get("fields", [])
	match warning["kind"]:
		"empty-name":
			return "wishem: the sidecar %s: the label of the field %s of the component type %s gives an empty name. The view does not get the field." % [warning["sidecar"], fields[0], warning["componentType"]]
	return ""


static func _before(a: Dictionary, b: Dictionary) -> bool:
	var x: Dictionary = a["warning"]
	var y: Dictionary = b["warning"]
	for key in ["sidecar", "componentType"]:
		if x[key] != y[key]:
			return x[key] < y[key]
	var x_name: String = x.get("name", "")
	var y_name: String = y.get("name", "")
	if x_name != y_name:
		return x_name < y_name
	if x["kind"] != y["kind"]:
		return x["kind"] < y["kind"]
	return a["index"] < b["index"]
