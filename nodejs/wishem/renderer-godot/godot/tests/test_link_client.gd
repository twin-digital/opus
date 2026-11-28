extends "res://tests/check.gd"

const Fake = preload("res://tests/fake_socket.gd")
const ID_PAGE := "^page-[0-9a-f]{16}$"
const ID_CONTROLS := "^page-controls-[0-9a-f]{16}$"

var _closer: RefCounted


func _matches(pattern: String, text: String) -> bool:
	return RegEx.create_from_string(pattern).search(text) != null


func _applied(seq: int, parts: Dictionary = {}) -> Dictionary:
	return {"t": "applied", "input": {"seq": seq, "source": "x", "type": "t", "payload": null}, "parts": parts}


func _close_client(_ports: Array) -> void:
	_closer.close()


func test_hello_is_the_first_and_only_message_before_welcome() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.step(10)
	h.step(10)
	var sent: Array = h.last_socket().sent_messages()
	assert_equal(sent.size(), 1)
	assert_equal(sent[0]["t"], "hello")
	assert_equal(sent[0]["protocol"], 1.0)
	var subsystems: Array = sent[0]["subsystems"]
	assert_equal(subsystems.size(), 2)
	assert_true(_matches(ID_PAGE, subsystems[0]["id"]), "first id")
	assert_equal(subsystems[0]["kind"], "output")
	assert_true(_matches(ID_CONTROLS, subsystems[1]["id"]), "second id")
	assert_equal(subsystems[1]["kind"], "input")


func test_hello_waits_until_the_socket_is_open() -> void:
	var h := Fake.Harness.new()
	h.client.poll(0)
	h.client.poll(1)
	assert_equal(h.last_socket().sent.size(), 0)
	assert_equal(h.last_socket().urls, ["ws://127.0.0.1:4749/link"])


func test_hello_sends_the_protocol_as_an_integer() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	assert_true(h.last_socket().sent[0].contains('"protocol":1,'), h.last_socket().sent[0])


func test_linked_comes_after_welcome_and_not_before() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	assert_equal(h.linked_events.size(), 0)
	h.welcome()
	assert_equal(h.linked_events.size(), 1)
	var ports: Array = h.linked_events[0]
	assert_equal(ports.size(), 2)
	assert_equal(ports[0].read(), {"counter": {"count": 6.0}, "time": {"ms": 0.0}})


func test_the_inbound_buffer_is_4_mib_before_the_connection() -> void:
	var h := Fake.Harness.new()
	h.client.poll(0)
	assert_equal(h.last_socket().buffer_at_connect, 4194304)


func test_a_welcome_with_a_state_of_1_mib_gives_linked() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	var big := "x".repeat(1024 * 1024)
	h.welcome({"state": {"store": {"blob": big}}})
	assert_equal(h.linked_events.size(), 1)
	assert_equal(h.linked_events[0][0].read()["store"]["blob"].length(), 1024 * 1024)


func test_a_gap_in_the_sequence_closes_the_socket_and_gives_down_once() -> void:
	var h := Fake.Harness.new()
	h.link({"seq": 3})
	h.receive(_applied(4))
	h.receive(_applied(6))
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)
	h.step(500)
	assert_equal(h.sockets.size(), 2)


func test_a_first_message_that_is_not_welcome_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.receive({"t": "event", "event": "started"})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_welcome_with_protocol_2_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.welcome({"protocol": 2})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_welcome_with_a_state_that_is_not_an_object_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.welcome({"state": [1]})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_welcome_with_the_status_stopped_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.welcome({"status": "stopped"})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_welcome_with_an_unknown_status_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.welcome({"status": "paused"})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_welcome_with_a_negative_seq_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.welcome({"seq": -1})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_welcome_with_a_fractional_seq_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.welcome({"seq": 1.5})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_a_message_that_is_not_an_object_closes_the_socket() -> void:
	for text in ["[1]", "garbage", '{"no":"type"}']:
		var h := Fake.Harness.new()
		h.link()
		h.receive(text)
		assert_equal(h.sockets[0].close_count, 1, text)
		assert_equal(h.down_count, 1, text)


func test_a_first_message_that_is_not_an_object_closes_the_socket() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.receive("[1]")
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)


func test_an_unknown_type_and_an_unknown_key_change_nothing() -> void:
	var h := Fake.Harness.new()
	var ports := h.link({"seq": 3})
	var before: Dictionary = ports[0].read()
	h.receive({"t": "apply", "parts": {"counter": {"count": 99}}})
	h.receive({"t": "part"})
	h.receive({"t": "something-new", "seq": 99})
	var applied := _applied(4, {"counter": {"count": 8}})
	applied["extra"] = true
	h.receive(applied)
	h.receive(_applied(5))
	assert_equal(h.sockets[0].close_count, 0)
	assert_equal(h.down_count, 0)
	assert_equal(ports[0].read()["counter"], {"count": 8.0})
	assert_equal(before["counter"], {"count": 6.0})


func test_an_event_with_an_unknown_value_closes_the_socket_and_gives_down_once() -> void:
	for event: Variant in ["paused", 5, null]:
		var h := Fake.Harness.new()
		h.link()
		h.receive({"t": "event", "event": event})
		assert_equal(h.sockets[0].close_count, 1, str(event))
		assert_equal(h.down_count, 1, str(event))


func test_a_result_with_neither_result_nor_error_closes_the_socket_and_gives_down_once() -> void:
	var h := Fake.Harness.new()
	h.link()
	h.receive({"t": "result", "request": 1})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)


func test_a_result_with_result_and_error_closes_the_socket_and_gives_down_once() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.receive({"t": "result", "request": 1, "result": {"ok": true, "seq": 4}, "error": "x"})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)
	assert_equal(submission.result, {"error": "The link closed."})


func test_a_result_with_no_ok_closes_the_socket_and_gives_down_once() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.receive({"t": "result", "request": 1, "result": {"seq": 4}})
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 1)
	assert_equal(submission.result, {"error": "The link closed."})


func _assert_result_is_malformed(outcome: Variant) -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.receive({"t": "result", "request": 1, "result": outcome})
	assert_equal(h.sockets[0].close_count, 1, str(outcome))
	assert_equal(h.down_count, 1, str(outcome))
	assert_equal(submission.result, {"error": "The link closed."}, str(outcome))


func _assert_result_is_accepted(outcome: Dictionary) -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.receive({"t": "result", "request": 1, "result": outcome})
	assert_equal(h.sockets[0].close_count, 0, str(outcome))
	assert_equal(h.down_count, 0, str(outcome))
	assert_equal(submission.result, outcome, str(outcome))


func test_an_accepted_result_with_a_bad_seq_closes_the_socket_and_gives_down_once() -> void:
	_assert_result_is_malformed({"ok": true})
	_assert_result_is_malformed({"ok": true, "seq": 1.5})
	_assert_result_is_malformed({"ok": true, "seq": -1})
	_assert_result_is_malformed({"ok": true, "seq": "4"})
	_assert_result_is_malformed({"ok": true, "seq": 9007199254740992.0})


func test_a_rejection_with_a_bad_reason_or_problems_closes_the_socket_and_gives_down_once() -> void:
	_assert_result_is_malformed({"ok": false, "problems": []})
	_assert_result_is_malformed({"ok": false, "reason": "other", "problems": []})
	_assert_result_is_malformed({"ok": false, "reason": 4, "problems": []})
	_assert_result_is_malformed({"ok": false, "reason": "invalid"})
	_assert_result_is_malformed({"ok": false, "reason": "invalid", "problems": "x"})
	_assert_result_is_malformed({"ok": false, "reason": "invalid", "problems": {}})


func test_a_correct_accepted_result_is_given_to_the_submission() -> void:
	_assert_result_is_accepted({"ok": true, "seq": 4})
	_assert_result_is_accepted({"ok": true, "seq": 9007199254740991})


func test_a_correct_rejection_is_given_to_the_submission_for_each_reason() -> void:
	for reason in ["not-permitted", "not-running", "unknown-type", "invalid"]:
		_assert_result_is_accepted({"ok": false, "reason": reason, "problems": []})


func test_a_result_for_an_unknown_request_changes_nothing() -> void:
	var h := Fake.Harness.new()
	h.link()
	h.receive({"t": "result", "request": 99, "result": {"ok": true, "seq": 1}})
	assert_equal(h.sockets[0].close_count, 0)
	assert_equal(h.down_count, 0)


func test_down_comes_once_at_the_start_when_the_socket_does_not_open() -> void:
	var h := Fake.Harness.new()
	h.connect_result = ERR_CANT_CONNECT
	h.client.poll(0)
	assert_equal(h.down_count, 1)
	h.client.poll(500)
	h.client.poll(1500)
	assert_equal(h.down_count, 1)
	assert_equal(h.sockets.size(), 3)


func test_down_comes_when_the_socket_closes_before_it_opens() -> void:
	var h := Fake.Harness.new()
	h.client.poll(0)
	h.last_socket().drop()
	h.client.poll(1)
	assert_equal(h.down_count, 1)


func test_down_comes_once_for_each_loss_and_again_after_a_welcome() -> void:
	var h := Fake.Harness.new()
	h.link()
	assert_equal(h.down_count, 0)
	h.last_socket().drop()
	h.step(1)
	assert_equal(h.down_count, 1)
	h.step(500)
	h.last_socket().drop()
	h.step(1)
	assert_equal(h.down_count, 1)
	h.step(1000)
	h.connect_socket()
	h.welcome()
	h.last_socket().drop()
	h.step(1)
	assert_equal(h.down_count, 2)


func test_refused_comes_once_for_each_period_with_no_link() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	h.receive({"t": "refused", "reason": "id-in-use", "message": "A subsystem ID is in use."})
	assert_equal(h.refused_events, [{"reason": "id-in-use", "message": "A subsystem ID is in use."}])
	assert_equal(h.down_count, 1)
	assert_equal(h.sockets[0].close_count, 1)
	h.step(500)
	h.connect_socket()
	h.receive({"t": "refused", "reason": "stopped", "message": "stopped"})
	assert_equal(h.refused_events.size(), 1)
	h.step(1000)
	h.connect_socket()
	h.welcome()
	h.last_socket().drop()
	h.step(1)
	h.step(500)
	h.connect_socket()
	h.receive({"t": "refused", "reason": "stopped", "message": "stopped"})
	assert_equal(h.refused_events.size(), 2)


func test_the_waits_are_500_1000_2000_4000_then_5000() -> void:
	var h := Fake.Harness.new()
	h.connect_result = ERR_CANT_CONNECT
	var attempts: Array[int] = []
	var seen := 0
	for ms in range(0, 20000):
		h.poll_at(ms)
		if h.sockets.size() > seen:
			seen = h.sockets.size()
			attempts.append(ms)
	assert_equal(attempts, [0, 500, 1500, 3500, 7500, 12500, 17500])


func test_the_wait_is_500_again_after_a_welcome() -> void:
	var h := Fake.Harness.new()
	h.connect_result = ERR_CANT_CONNECT
	h.poll_at(0)
	h.poll_at(500)
	h.poll_at(1500)
	h.connect_result = OK
	h.poll_at(3500)
	h.last_socket().open()
	h.poll_at(3500)
	h.welcome()
	h.last_socket().drop()
	h.poll_at(4000)
	assert_equal(h.sockets.size(), 4)
	h.poll_at(4499)
	assert_equal(h.sockets.size(), 4)
	h.poll_at(4500)
	assert_equal(h.sockets.size(), 5)


func _ids_of(socket: RefCounted) -> Array:
	var ids: Array = []
	for subsystem: Dictionary in Fake.Harness.new().hello_of(socket)["subsystems"]:
		ids.append(subsystem["id"])
	return ids


func test_a_new_link_has_the_same_ids() -> void:
	var h := Fake.Harness.new()
	h.link()
	var first := _ids_of(h.sockets[0])
	h.last_socket().drop()
	h.step(1)
	h.step(500)
	h.connect_socket()
	h.welcome()
	h.last_socket().drop()
	h.step(1)
	h.step(500)
	h.connect_socket()
	assert_equal(_ids_of(h.last_socket()), first)
	assert_true(_matches(ID_CONTROLS, first[1]), "form")


func test_new_ids_come_after_id_in_use_and_stay_for_the_next_links() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	var first := _ids_of(h.last_socket())
	h.receive({"t": "refused", "reason": "id-in-use", "message": "A subsystem ID is in use."})
	h.step(500)
	h.connect_socket()
	var second := _ids_of(h.last_socket())
	assert_true(first[0] != second[0], "first id")
	assert_true(first[1] != second[1], "second id")
	assert_true(_matches(ID_CONTROLS, second[1]), "form")
	h.welcome()
	h.last_socket().drop()
	h.step(1)
	h.step(500)
	h.connect_socket()
	assert_equal(_ids_of(h.last_socket()), second)


func test_the_same_ids_stay_after_a_refusal_with_a_different_reason() -> void:
	var h := Fake.Harness.new()
	h.connect_socket()
	var first := _ids_of(h.last_socket())
	h.receive({"t": "refused", "reason": "stopped", "message": "stopped"})
	h.step(500)
	h.connect_socket()
	assert_equal(_ids_of(h.last_socket()), first)


func test_the_hub_side_stops_and_starts() -> void:
	var h := Fake.Harness.new()
	var first := h.link()
	h.receive({"t": "event", "event": "stopping"})
	h.last_socket().drop()
	h.step(1)
	assert_equal(h.down_count, 1)
	h.step(500)
	h.connect_socket()
	h.welcome({"state": {"counter": {"count": 0}}})
	assert_equal(h.linked_events.size(), 2)
	assert_equal(h.linked_events[1][0].read(), {"counter": {"count": 0.0}})
	assert_equal(first[0].read()["counter"], {"count": 6.0})
	assert_equal(h.down_count, 1)


func test_close_twice_does_nothing_the_second_time() -> void:
	var h := Fake.Harness.new()
	h.link()
	h.client.close()
	h.client.close()
	assert_equal(h.sockets[0].close_count, 1)


func test_close_during_a_wait_stops_the_attempts() -> void:
	var h := Fake.Harness.new()
	h.connect_result = ERR_CANT_CONNECT
	h.poll_at(0)
	h.client.close()
	h.poll_at(100000)
	assert_equal(h.sockets.size(), 1)
	assert_equal(h.down_count, 1)
	assert_equal(h.linked_events.size(), 0)


func test_close_while_the_socket_connects_gives_no_link_and_no_down() -> void:
	var h := Fake.Harness.new()
	h.client.poll(0)
	h.client.close()
	h.last_socket().open()
	h.poll_at(10)
	h.poll_at(100000)
	assert_equal(h.sockets.size(), 1)
	assert_equal(h.last_socket().sent.size(), 0)
	assert_equal(h.last_socket().close_count, 1)
	assert_equal(h.linked_events.size(), 0)
	assert_equal(h.down_count, 0)


func test_close_inside_a_linked_handler_stops_everything() -> void:
	var h := Fake.Harness.new()
	_closer = h.client
	h.client.linked.connect(_close_client)
	h.link()
	h.last_socket().drop()
	h.poll_at(100000)
	assert_equal(h.sockets.size(), 1)
	assert_equal(h.linked_events.size(), 1)
	assert_equal(h.down_count, 0)
	assert_equal(h.sockets[0].close_count, 1)


func test_a_list_with_no_subsystem_gives_an_error_and_no_socket() -> void:
	var h := Fake.Harness.new([])
	assert_true(h.client.error != "", "error")
	h.poll_at(0)
	h.poll_at(100000)
	assert_equal(h.sockets.size(), 0)
	assert_equal(h.down_count, 0)


func test_seq_gives_the_number_of_the_last_input() -> void:
	var h := Fake.Harness.new()
	assert_equal(h.client.seq(), 0, "before the link")
	h.link({"seq": 3})
	assert_equal(h.client.seq(), 3, "after welcome")
	h.receive(_applied(4))
	assert_equal(h.client.seq(), 4, "after applied")
