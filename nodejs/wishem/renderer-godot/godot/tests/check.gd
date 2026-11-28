extends RefCounted
## Base class of a test file. A failed check records its message and returns.

var failures: Array[String] = []


func assert_equal(actual: Variant, expected: Variant, message: String = "") -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		failures.append("%sexpected %s, got %s" % [_prefix(message), var_to_str(expected), var_to_str(actual)])


func assert_true(condition: bool, message: String = "") -> void:
	if not condition:
		failures.append("%sexpected true" % _prefix(message))


func _prefix(message: String) -> String:
	return "" if message.is_empty() else message + ": "
