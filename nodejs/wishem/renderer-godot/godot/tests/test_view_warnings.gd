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


func test_gives_no_warning_for_a_view_with_no_definition() -> void:
	assert_equal(ViewWarnings.view_warnings(_table(), []), [])


func test_describes_the_warning_in_one_line() -> void:
	var warnings := ViewWarnings.view_warnings(_table(), [_definition(["???"])])
	assert_equal(
		ViewWarnings.describe_warning(warnings[0]),
		"wishem: the sidecar A.view.json: the label of the field fld_0 of the component type %s gives an empty name. The view does not get the field." % CT1,
	)
