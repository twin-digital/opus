extends "res://tests/check.gd"

const Views = preload("res://wishem/views.gd")
const CT1 := "ct_00000000-0000-4000-8000-000000000001"
const CT2 := "ct_00000000-0000-4000-8000-000000000002"
const FOLDER := "res://tests/views/"


const RING_VIEW := """extends RefCounted


func create() -> Node:
	return Node.new()


func update(_node: Node, _props: Dictionary, _viewport: Vector2) -> void:
	pass
"""


func _write(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(text)
	file.close()


func _remove_folder(folder: String) -> void:
	for name in DirAccess.get_files_at(folder):
		DirAccess.remove_absolute(folder.path_join(name))
	DirAccess.remove_absolute(folder)


func _definition(labels: Array) -> Dictionary:
	var fields: Array = []
	for index in labels.size():
		fields.append({"id": "fld_%d" % index, "label": labels[index], "type": "string"})
	return {"id": CT1, "label": "Thing", "fields": fields}


func _errors_mention(result: Dictionary, file: String) -> bool:
	for error: String in result["errors"]:
		if error.contains(file):
			return true
	return false


func test_field_name_keeps_a_label_of_one_word() -> void:
	assert_equal(Views.field_name("title"), "title")


func test_field_name_joins_the_words_in_camel_case() -> void:
	assert_equal(Views.field_name("Max health"), "maxHealth")


func test_field_name_keeps_a_label_with_the_form_of_a_name() -> void:
	assert_equal(Views.field_name("maxHealth"), "maxHealth")


func test_field_name_divides_at_each_run_of_other_characters() -> void:
	assert_equal(Views.field_name("  max -- health_points!"), "maxHealthPoints")


func test_field_name_changes_only_the_first_character_of_a_word() -> void:
	assert_equal(Views.field_name("Max HEALTH"), "maxHEALTH")


func test_field_name_gives_an_empty_name_for_a_label_with_no_letter_or_digit() -> void:
	assert_equal(Views.field_name("--- !!"), "")


func test_props_gives_one_prop_for_each_field() -> void:
	var component := {"fld_0": "10", "fld_1": "x"}
	assert_equal(Views.props(_definition(["Max health", "title"]), component), {"maxHealth": "10", "title": "x"})


func test_props_gives_no_prop_for_a_field_with_no_value() -> void:
	var props := Views.props(_definition(["Max health", "title"]), {"fld_1": "x"})
	assert_equal(props, {"title": "x"})
	assert_true(not props.has("maxHealth"), "no key for the field with no value")


func test_props_gives_the_value_of_the_first_of_two_fields_with_one_name() -> void:
	var component := {"fld_0": "first", "fld_1": "other", "fld_2": "second"}
	assert_equal(Views.props(_definition(["Max health", "other", "max-health"]), component), {"maxHealth": "first", "other": "other"})


func test_props_gives_no_value_when_the_first_of_two_fields_with_one_name_has_none() -> void:
	assert_equal(Views.props(_definition(["Max health", "max-health"]), {"fld_1": "second"}), {})


func test_props_gives_no_prop_for_a_label_with_an_empty_name() -> void:
	assert_equal(Views.props(_definition(["???", "title"]), {"fld_0": "a", "fld_1": "b"}), {"title": "b"})


func test_collect_views_attaches_a_view_by_its_sidecar() -> void:
	var result := Views.collect_views(FOLDER + "ok")
	assert_equal(result["errors"], [])
	assert_equal(result["views"].keys(), [CT1, CT2])
	var entry: Dictionary = result["views"][CT1]
	assert_equal(entry["sidecar"], "Box.view.json")
	assert_true(entry["view"].has_method("create") and entry["view"].has_method("update"), "the view is an instance with both functions")
	assert_equal(result["views"][CT2]["sidecar"], "Ring.view.json")


func test_collect_views_ignores_a_sidecar_of_another_kind() -> void:
	var result := Views.collect_views(FOLDER + "other_kind")
	assert_equal(result["views"], {})
	assert_equal(result["errors"], [])


func test_collect_views_reports_a_missing_view_file_and_keeps_the_other_views() -> void:
	var result := Views.collect_views(FOLDER + "missing")
	assert_equal(result["errors"].size(), 1)
	assert_true(_errors_mention(result, "Box.view.json"), "the error names Box.view.json")
	assert_equal(result["views"].keys(), [CT2])


func test_collect_views_reports_a_sidecar_that_is_not_json() -> void:
	var folder := "user://wishem-test-bad-json"
	DirAccess.make_dir_recursive_absolute(folder)
	_write(folder + "/Box.view.json", "{ not json")
	_write(folder + "/Ring.view.json", '{ "kind": "godot", "componentType": "%s" }' % CT2)
	_write(folder + "/Ring.gd", RING_VIEW)
	var result := Views.collect_views(folder)
	_remove_folder(folder)
	assert_equal(result["errors"].size(), 1)
	assert_true(_errors_mention(result, "Box.view.json"), "the error names Box.view.json")
	assert_equal(result["views"].keys(), [CT2])


func test_collect_views_reports_a_sidecar_with_no_text_component_type() -> void:
	var result := Views.collect_views(FOLDER + "no_type")
	assert_equal(result["errors"].size(), 2)
	assert_true(_errors_mention(result, "Box.view.json"), "the error names Box.view.json")
	assert_true(_errors_mention(result, "Count.view.json"), "the error names Count.view.json")
	assert_equal(result["views"].keys(), [CT2])


func test_collect_views_reports_a_view_with_no_create() -> void:
	var result := Views.collect_views(FOLDER + "no_create")
	assert_equal(result["views"], {})
	assert_equal(result["errors"].size(), 1)
	assert_true(_errors_mention(result, "Box.gd"), "the error names Box.gd")


func test_collect_views_reports_a_view_with_no_update() -> void:
	var result := Views.collect_views(FOLDER + "no_update")
	assert_equal(result["views"], {})
	assert_equal(result["errors"].size(), 1)
	assert_true(_errors_mention(result, "Box.gd"), "the error names Box.gd")


func test_collect_views_reports_two_sidecars_with_one_component_type() -> void:
	var result := Views.collect_views(FOLDER + "duplicate")
	assert_equal(result["errors"].size(), 1)
	assert_true(_errors_mention(result, "Alpha.view.json") and _errors_mention(result, "Beta.view.json"), "the error names both sidecars")
	assert_true(result["errors"][0].contains(CT1), "the error names the component type")
	assert_equal(result["views"].keys(), [CT2])


func test_collect_views_gives_an_error_for_a_folder_that_does_not_open() -> void:
	var result := Views.collect_views(FOLDER + "nothing_here")
	assert_equal(result["views"], {})
	assert_equal(result["errors"].size(), 1)


func test_the_order_of_the_files_does_not_change_the_table() -> void:
	var forward := Views.collect_from(FOLDER + "duplicate", ["Alpha.view.json", "Beta.view.json", "Gamma.view.json"])
	var backward := Views.collect_from(FOLDER + "duplicate", ["Gamma.view.json", "Beta.view.json", "Alpha.view.json"])
	assert_equal(backward["errors"], forward["errors"])
	assert_equal(backward["views"].keys(), forward["views"].keys())
	assert_equal(backward["views"][CT2]["sidecar"], "Gamma.view.json")


func _name_list(result: Dictionary) -> Array:
	var names: Array = []
	for entry: Dictionary in result["names"]:
		names.append(entry["name"])
	return names


func test_prop_names_gives_a_problem_for_each_empty_name() -> void:
	var result := Views.prop_names(_definition(["Color", "???", "--"]))
	assert_equal(_name_list(result), ["color"])
	assert_equal(result["problems"], [{"kind": "empty-name", "field": "fld_1"}, {"kind": "empty-name", "field": "fld_2"}])


func test_prop_names_keeps_the_first_field_for_two_labels_with_one_name() -> void:
	var result := Views.prop_names(_definition(["Max health", "max-health"]))
	assert_equal(_name_list(result), ["maxHealth"])
	assert_equal(result["names"][0]["field"]["id"], "fld_0")
	assert_equal(result["problems"], [{"kind": "same-name", "name": "maxHealth", "fields": ["fld_0", "fld_1"]}])


func test_props_and_prop_names_accept_a_label_that_starts_with_a_digit() -> void:
	var definition := _definition(["2nd line"])
	assert_equal(Views.props(definition, {"fld_0": "v"}), {"2ndLine": "v"})
	assert_equal(Views.prop_names(definition)["problems"], [])
