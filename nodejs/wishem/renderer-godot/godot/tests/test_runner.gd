extends "res://tests/check.gd"


func test_passes() -> void:
	assert_equal(1 + 1, 2)
	assert_true(true)
