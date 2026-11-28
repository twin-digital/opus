extends "res://tests/check.gd"

const ViewWarnings = preload("res://wishem/view_warnings.gd")
const CT1 := "ct_00000000-0000-4000-8000-000000000001"


func _definition(labels: Array) -> Dictionary:
	var fields: Array = []
	for index in labels.size():
		fields.append({"id": "fld_%d" % index, "label": labels[index], "type": "string"})
	return {"id": CT1, "label": "Thing", "fields": fields}


func _table() -> Dictionary:
	return {CT1: {"sidecar": "A.view.json", "view": RefCounted.new()}}


func test_gives_a_warning_for_a_label_with_an_empty_name() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["???", "title"])])
	assert_equal(warnings, [{"kind": "empty-name", "sidecar": "A.view.json", "componentType": CT1, "fields": ["fld_0"]}])


func test_gives_the_warnings_in_the_order_of_the_fields() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["???", "--"])])
	assert_equal(warnings.size(), 2)
	assert_equal(warnings[0]["fields"], ["fld_0"])
	assert_equal(warnings[1]["fields"], ["fld_1"])


func test_gives_a_warning_for_a_view_with_no_definition() -> void:
	assert_equal(ViewWarnings.view_warnings(_table(), []), [{"kind": "component-type-not-defined", "sidecar": "A.view.json", "componentType": CT1}])


func test_sorts_the_warning_of_a_missing_definition_before_a_later_sidecar() -> void:
	var table := {
		"ct_b": {"sidecar": "B.view.json", "view": RefCounted.new()},
		CT1: {"sidecar": "A.view.json", "view": RefCounted.new()},
	}
	var definition := _definition(["???"])
	definition["id"] = "ct_b"
	var warnings := ViewWarnings.view_warnings(table, [definition])
	assert_equal(warnings.size(), 2)
	assert_equal(warnings[0]["kind"], "component-type-not-defined")
	assert_equal(warnings[0]["sidecar"], "A.view.json")
	assert_equal(warnings[1]["kind"], "empty-name")
	assert_equal(warnings[1]["sidecar"], "B.view.json")


func test_describes_the_warning_in_one_line() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["???"])])
	assert_equal(
		ViewWarnings.describe_warning(warnings[0]),
		"wishem: the sidecar A.view.json: the label of the field fld_0 of the component type %s gives an empty name. The view does not get the field." % CT1,
	)


func test_describes_the_warning_of_a_missing_definition() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [])
	assert_equal(
		ViewWarnings.describe_warning(warnings[0]),
		"wishem: the sidecar A.view.json names the component type %s, which no definition has. No view is drawn for it." % CT1,
	)


func _same_name(name: String, fields: Array) -> Dictionary:
	return {"kind": "same-name", "sidecar": "A.view.json", "componentType": CT1, "name": name, "fields": fields}


func test_gives_a_warning_for_two_labels_with_one_name() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["Max health", "max-health"])])
	assert_equal(warnings, [_same_name("maxHealth", ["fld_0", "fld_1"])])


func test_gives_a_warning_for_each_later_field_with_the_first_field() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["Color", "color", "color!"])])
	assert_equal(warnings, [_same_name("color", ["fld_0", "fld_1"]), _same_name("color", ["fld_0", "fld_2"])])


func test_sorts_the_warning_empty_name_before_same_name() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["???", "Max health", "max-health"])])
	assert_equal(warnings.size(), 2)
	assert_equal(warnings[0]["kind"], "empty-name")
	assert_equal(warnings[1]["kind"], "same-name")


func test_sorts_the_warnings_by_name() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["b", "B", "a", "A"])])
	assert_equal(warnings.map(func(warning: Dictionary) -> String: return warning["name"]), ["a", "b"])


func test_keeps_the_order_of_the_fields_for_warnings_that_rank_equal() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["???", "--", "!!", "##", "%%"])])
	assert_equal(warnings.map(func(warning: Dictionary) -> String: return warning["fields"][0]), ["fld_0", "fld_1", "fld_2", "fld_3", "fld_4"])


func test_sorts_by_sidecar_before_component_type() -> void:
	var table := {
		"ct_a": {"sidecar": "B.view.json", "view": RefCounted.new()},
		"ct_b": {"sidecar": "A.view.json", "view": RefCounted.new()},
	}
	var warnings := ViewWarnings.view_warnings(table, [])
	assert_equal(warnings.map(func(warning: Dictionary) -> String: return warning["componentType"]), ["ct_b", "ct_a"])


func test_describes_the_warning_for_the_same_name() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["Max health", "max-health"])])
	assert_equal(
		ViewWarnings.describe_warning(warnings[0]),
		"wishem: the sidecar A.view.json: the fields fld_0 and fld_1 of the component type %s give the same name \"maxHealth\". The prop has the value of the first field." % CT1,
	)
