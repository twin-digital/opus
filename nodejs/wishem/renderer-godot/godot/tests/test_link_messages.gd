extends "res://tests/check.gd"

const Messages = preload("res://wishem/link_messages.gd")
const FIXTURE := "res://tests/fixtures/link-examples.json"


func _examples() -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))


func test_hello_has_the_keys_of_the_document() -> void:
	var message := Messages.hello([{"id": "page", "kind": "output"}, {"id": "page-controls", "kind": "input"}])
	assert_equal(message.keys(), ["t", "protocol", "subsystems"])
	assert_equal(message["t"], "hello")
	assert_equal(message["protocol"], 1)
	assert_equal(message["subsystems"].size(), 2)
	assert_equal(message["subsystems"][1], {"id": "page-controls", "kind": "input"})


func test_hello_text_is_the_example() -> void:
	var message := Messages.hello([{"id": "page", "kind": "output"}, {"id": "page-controls", "kind": "input"}])
	assert_equal(Messages.parse(JSON.stringify(message)), _examples()["hello"])


func test_submit_has_the_keys_of_the_document() -> void:
	var message := Messages.submit(1, "page-controls", {"type": "counter/add", "payload": {"by": 2}})
	assert_equal(message.keys(), ["t", "request", "subsystem", "input"])
	assert_equal(message["request"], 1)
	assert_equal(Messages.parse(JSON.stringify(message)), _examples()["submit"])


func test_new_id_has_the_form_of_a_generated_id() -> void:
	var regex := RegEx.create_from_string("^godot-screen-[0-9a-f]{16}$")
	var id := Messages.new_id("godot-screen")
	assert_true(regex.search(id) != null, "id " + id)


func test_new_id_gives_a_different_id_each_time() -> void:
	assert_true(Messages.new_id("godot-screen") != Messages.new_id("godot-screen"))


func test_is_id_accepts_lowercase_digits_and_single_hyphens() -> void:
	for id in ["page", "page-controls", "a1", "godot-screen-0123456789abcdef", "a-b-c"]:
		assert_true(Messages.is_id(id), id)


func test_is_id_rejects_other_text() -> void:
	for id in ["", "Page", "1page", "-page", "page-", "pa--ge", "pa ge", "pa_ge", "pagé"]:
		assert_true(not Messages.is_id(id), "'%s'" % id)


func test_parse_gives_the_object_with_a_text_type() -> void:
	assert_equal(Messages.parse('{"t":"event","event":"started"}'), {"t": "event", "event": "started"})


func test_parse_gives_an_empty_dictionary_for_text_that_is_not_json() -> void:
	assert_equal(Messages.parse("not json"), {})
	assert_equal(Messages.parse(""), {})


func test_parse_gives_an_empty_dictionary_for_a_list() -> void:
	assert_equal(Messages.parse('[{"t":"event"}]'), {})


func test_parse_gives_an_empty_dictionary_for_an_object_with_no_text_t() -> void:
	assert_equal(Messages.parse('{"event":"started"}'), {})
	assert_equal(Messages.parse('{"t":1}'), {})


func test_as_int_converts_a_whole_float() -> void:
	assert_equal(Messages.as_int(4.0), 4)
	assert_equal(Messages.as_int(4), 4)
	assert_equal(Messages.as_int(0.0), 0)
	assert_equal(Messages.as_int(float(9007199254740991)), 9007199254740991)


func test_as_int_gives_null_for_a_value_that_is_not_an_integer() -> void:
	assert_equal(Messages.as_int(4.5), null)
	assert_equal(Messages.as_int("4"), null)
	assert_equal(Messages.as_int(null), null)
	assert_equal(Messages.as_int(INF), null)
	assert_equal(Messages.as_int(NAN), null)
	assert_equal(Messages.as_int(1e300), null)


func test_each_message_of_the_fixture_parses() -> void:
	var examples := _examples()
	assert_true(examples.size() > 10, "the fixture has the examples")
	for name in examples:
		var parsed := Messages.parse(JSON.stringify(examples[name]))
		assert_equal(parsed, examples[name], name)
