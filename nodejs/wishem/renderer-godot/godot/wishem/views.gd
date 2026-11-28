extends RefCounted
## The Godot views of a folder, and the props that a view gets. Static functions with no state.
##
## A view is a file `<name>.gd` with `create() -> Node` and `update(node, props, viewport)`.
## Its sidecar `<name>.view.json` is `{ "kind": "godot", "componentType": "<ID>" }`.

const KIND := "godot"
const SIDECAR_SUFFIX := ".view.json"

static var _word_pattern := RegEx.create_from_string("[A-Za-z0-9]+")


## The name of a prop for the label of a field. Can start with a digit. Empty when the label has no letter or digit.
static func field_name(label: String) -> String:
	var name := ""
	for match in _word_pattern.search_all(label):
		var word := match.get_string()
		var first := word.substr(0, 1)
		name += (first.to_lower() if name.is_empty() else first.to_upper()) + word.substr(1)
	return name


## Gives `{ "names": [{ "name": String, "field": Dictionary }], "problems": [Dictionary] }`.
## A problem is `{ "kind": "empty-name", "field": ID }` or `{ "kind": "same-name", "name": String, "fields": [ID, ID] }`.
## One entry for each name, in the order of the definition. A field with an empty name has no entry.
static func prop_names(definition: Dictionary) -> Dictionary:
	var names: Array = []
	var problems: Array = []
	var first := {}
	for field: Dictionary in definition.get("fields", []):
		var name := field_name(str(field.get("label", "")))
		if name.is_empty():
			problems.append({"kind": "empty-name", "field": field["id"]})
			continue
		if first.has(name):
			problems.append({"kind": "same-name", "name": name, "fields": [first[name], field["id"]]})
			continue
		first[name] = field["id"]
		names.append({"name": name, "field": field})
	return {"names": names, "problems": problems}


## One prop for each field of the definition that has a value. For two fields with one name, the first field.
static func props(definition: Dictionary, component: Dictionary) -> Dictionary:
	var result := {}
	for entry: Dictionary in prop_names(definition)["names"]:
		var id: String = entry["field"]["id"]
		if component.has(id):
			result[entry["name"]] = component[id]
	return result


## Gives `{ "views": { <ID>: { "sidecar": String, "view": RefCounted } }, "errors": [String] }`.
static func collect_views(folder: String) -> Dictionary:
	if not DirAccess.dir_exists_absolute(folder):
		return {"views": {}, "errors": ["wishem: the folder %s does not exist." % folder]}
	var names: Array = []
	for file in DirAccess.get_files_at(folder):
		if file.ends_with(SIDECAR_SUFFIX):
			names.append(file)
	return collect_from(folder, names)


## Like `collect_views`, for the sidecar files in `names`. The order of `names` does not change the result.
static func collect_from(folder: String, names: Array) -> Dictionary:
	var sorted := names.duplicate()
	sorted.sort()
	var views := {}
	var errors: Array[String] = []
	var rejected := {}
	for sidecar_file: String in sorted:
		var entry := _load(folder, sidecar_file, errors)
		if entry.is_empty():
			continue
		var type: String = entry["componentType"]
		if rejected.has(type):
			errors.append("wishem: the sidecar %s names the component type %s of an earlier duplicate. No view is drawn." % [sidecar_file, type])
		elif views.has(type):
			errors.append("wishem: the sidecars %s and %s name the same component type %s. No view is drawn." % [views[type]["sidecar"], sidecar_file, type])
			views.erase(type)
			rejected[type] = true
		else:
			views[type] = {"sidecar": sidecar_file, "view": entry["view"]}
	return {"views": views, "errors": errors}


## Gives `{ "componentType", "view" }`, or an empty dictionary for an ignored or a wrong sidecar.
static func _load(folder: String, sidecar_file: String, errors: Array[String]) -> Dictionary:
	var json := JSON.new()
	var text := FileAccess.get_file_as_string(folder.path_join(sidecar_file))
	var sidecar: Variant = json.data if json.parse(text) == OK else null
	if typeof(sidecar) != TYPE_DICTIONARY or typeof(sidecar.get("kind")) != TYPE_STRING or typeof(sidecar.get("componentType")) != TYPE_STRING:
		errors.append("wishem: the sidecar %s is not a JSON object with a \"kind\" and a \"componentType\" that are text. No view is drawn." % sidecar_file)
		return {}
	if sidecar["kind"] != KIND:
		return {}
	var view_file := sidecar_file.trim_suffix(SIDECAR_SUFFIX) + ".gd"
	var path := folder.path_join(view_file)
	if not ResourceLoader.exists(path):
		errors.append("wishem: the sidecar %s has no view file %s. No view is drawn." % [sidecar_file, view_file])
		return {}
	var script: Variant = load(path)
	if not script is GDScript or not (script as GDScript).can_instantiate():
		errors.append("wishem: the view file %s of the sidecar %s does not load. No view is drawn." % [view_file, sidecar_file])
		return {}
	var view: Object = (script as GDScript).new()
	if not view.has_method("create") or not view.has_method("update"):
		errors.append("wishem: the view file %s of the sidecar %s has no create and update functions. No view is drawn." % [view_file, sidecar_file])
		return {}
	return {"componentType": sidecar["componentType"], "view": view}
