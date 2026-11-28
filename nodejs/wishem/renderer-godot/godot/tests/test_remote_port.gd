extends "res://tests/check.gd"

const Fake = preload("res://tests/fake_socket.gd")
const Messages = preload("res://wishem/link_messages.gd")
const FIXTURE := "res://tests/fixtures/link-examples.json"


class Recorder:
	extends RefCounted
	var items: Array = []
	var order: Array = []
	var name := ""

	func record(item: Variant) -> void:
		items.append(item)
		order.append(name)


func _examples() -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))


func _applied(seq: int, parts: Dictionary = {}, type := "t") -> Dictionary:
	return {"t": "applied", "input": {"seq": seq, "source": "x", "type": type, "payload": null}, "parts": parts}


func _ids_replaced(hello: Dictionary, example: Dictionary) -> Dictionary:
	var copy: Dictionary = hello.duplicate(true)
	for index in copy["subsystems"].size():
		copy["subsystems"][index]["id"] = example["subsystems"][index]["id"]
	return copy


func test_the_full_example_message_by_message() -> void:
	var examples := _examples()
	var h := Fake.Harness.new()
	h.connect_socket()
	var sent: Array = h.last_socket().sent_messages()
	assert_equal(sent.size(), 1)
	assert_equal(_ids_replaced(sent[0], examples["hello"]), examples["hello"])
	var ids: Array = []
	for subsystem: Dictionary in sent[0]["subsystems"]:
		ids.append(subsystem["id"])
	h.receive(examples["welcome"])
	var ports: Array = h.linked_events[0]
	assert_equal(ports[1].read(), examples["welcome"]["state"])

	var submission = ports[1].submit(examples["submit"]["input"])
	sent = h.last_socket().sent_messages()
	assert_equal(sent.size(), 2)
	var submit: Dictionary = sent[1].duplicate(true)
	assert_equal(submit["subsystem"], ids[1])
	submit["subsystem"] = examples["submit"]["subsystem"]
	assert_equal(submit, examples["submit"])

	h.receive(examples["applied"])
	assert_equal(ports[1].read(), {"counter": {"count": 8.0}})
	assert_equal(ports[0].read(), {"counter": {"count": 8.0}})
	h.receive(examples["result"])
	assert_equal(submission.result, {"ok": true, "seq": 4})

	var recorder := Recorder.new()
	ports[0].subscribe(recorder.record)
	var rewind = ports[1].submit(examples["rewind"]["input"])
	var rewind_message: Dictionary = h.last_socket().sent_messages()[2].duplicate(true)
	rewind_message["subsystem"] = examples["rewind"]["subsystem"]
	rewind_message["request"] = examples["rewind"]["request"]
	assert_equal(rewind_message, examples["rewind"])
	h.receive(examples["rewound"])
	assert_equal(recorder.items.size(), 1)
	assert_equal(recorder.items[0]["type"], "applied")
	assert_equal(recorder.items[0]["input"]["type"], "hub/rewind")
	assert_equal(ports[0].read(), {"counter": {"count": 4.0}})
	var rewind_result: Dictionary = examples["rewindResult"].duplicate(true)
	rewind_result["request"] = 2
	h.receive(rewind_result)
	assert_equal(rewind.result, {"ok": true, "seq": 5})
	assert_equal(h.down_count, 0)


func test_an_applied_with_only_time_keeps_the_same_store_object() -> void:
	var h := Fake.Harness.new()
	var ports := h.link({"state": {"store": {"a": 1}, "time": {"ms": 0}}})
	var before: Dictionary = ports[0].read()
	h.receive(_applied(4, {"time": {"ms": 500}}))
	var after: Dictionary = ports[0].read()
	assert_equal(after["time"], {"ms": 500.0})
	assert_true(is_same(after["store"], before["store"]), "store")
	assert_true(not is_same(after["time"], before["time"]), "time")
	assert_equal(before["time"], {"ms": 0.0})


func test_ports_of_one_link_share_one_state() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	h.receive(_applied(4, {"counter": {"count": 8}}))
	assert_true(is_same(ports[0].read(), ports[1].read()), "same state")


func test_listeners_are_called_in_the_order_of_registration() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var first := Recorder.new()
	first.name = "first"
	var second := Recorder.new()
	second.name = "second"
	var shared: Array = []
	var other := Recorder.new()
	other.name = "other-port"
	other.order = shared
	first.order = shared
	second.order = shared
	ports[0].subscribe(first.record)
	ports[0].subscribe(second.record)
	ports[1].subscribe(other.record)
	h.receive(_applied(4))
	assert_equal(shared, ["first", "second", "other-port"])


func test_the_function_that_subscribe_gives_removes_the_listener() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var kept := Recorder.new()
	var removed := Recorder.new()
	ports[0].subscribe(kept.record)
	var unsubscribe: Callable = ports[0].subscribe(removed.record)
	h.receive(_applied(4))
	unsubscribe.call()
	h.receive(_applied(5))
	assert_equal(kept.items.size(), 2)
	assert_equal(removed.items.size(), 1)


func test_listeners_get_applied_started_and_stopping_events() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var recorder := Recorder.new()
	ports[0].subscribe(recorder.record)
	h.receive({"t": "event", "event": "started"})
	h.receive(_applied(4, {}, "counter/add"))
	h.receive({"t": "event", "event": "stopping"})
	h.receive({"t": "event", "event": "something-new"})
	assert_equal(recorder.items.size(), 3)
	assert_equal(recorder.items[0], {"type": "started"})
	assert_equal(recorder.items[1]["type"], "applied")
	assert_equal(recorder.items[1]["input"], {"seq": 4, "source": "x", "type": "counter/add", "payload": null})
	assert_equal(recorder.items[2], {"type": "stopping"})


func test_submit_sends_request_numbers_1_2_3_as_integers() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	for index in 3:
		ports[1].submit({"type": "counter/add", "payload": {"by": 1}})
	var requests: Array = []
	for text in h.last_socket().sent.slice(1):
		requests.append(Messages.parse(text)["request"])
		assert_true(text.contains('"request":%d,' % requests.size()), text)
	assert_equal(requests, [1.0, 2.0, 3.0])


func test_a_result_gives_the_result_to_the_matching_submission() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var first = ports[1].submit({"type": "a"})
	var second = ports[1].submit({"type": "b"})
	var third = ports[1].submit({"type": "c"})
	assert_true(not first.done, "pending")
	h.receive({"t": "result", "request": 3, "result": {"ok": true, "seq": 6}})
	h.receive({"t": "result", "request": 1, "result": {"ok": true, "seq": 4}})
	h.receive({"t": "result", "request": 2, "result": {"ok": false, "reason": "invalid", "problems": [{"message": "m"}]}})
	assert_equal(first.result, {"ok": true, "seq": 4})
	assert_equal(second.result, {"ok": false, "reason": "invalid", "problems": [{"message": "m"}]})
	assert_equal(third.result, {"ok": true, "seq": 6})
	assert_true(first.done and second.done and third.done, "done")


func test_a_failed_result_gives_the_error() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.receive({"t": "result", "request": 1, "error": "The model subsystem failed."})
	assert_equal(submission.result, {"error": "The model subsystem failed."})


func test_the_finished_signal_comes_with_the_result_after_the_applied_event() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var shared: Array = []
	var events := Recorder.new()
	events.name = "applied"
	events.order = shared
	var results := Recorder.new()
	results.name = "finished"
	results.order = shared
	ports[0].subscribe(events.record)
	var submission = ports[1].submit({"type": "a"})
	submission.finished.connect(results.record)
	h.receive(_applied(4, {}, "a"))
	h.receive({"t": "result", "request": 1, "result": {"ok": true, "seq": 4}})
	assert_equal(shared, ["applied", "finished"])
	assert_equal(results.items, [{"ok": true, "seq": 4}])


func test_a_result_for_an_unknown_request_is_ignored() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.receive({"t": "result", "request": 9, "result": {"ok": true, "seq": 4}})
	assert_true(not submission.done, "pending")
	assert_equal(h.sockets[0].close_count, 0)


func test_an_output_port_gives_not_permitted_and_sends_nothing() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[0].submit({"type": "a"})
	assert_equal(submission.result, {"ok": false, "reason": "not-permitted", "problems": []})
	assert_true(submission.done, "done")
	assert_equal(h.last_socket().sent.size(), 1)


func test_a_port_with_no_link_gives_not_running_and_sends_nothing() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	h.last_socket().drop()
	h.step(1)
	var submission = ports[1].submit({"type": "a"})
	assert_equal(submission.result, {"ok": false, "reason": "not-running", "problems": []})
	assert_equal(h.sockets[0].sent.size(), 1)


func test_the_link_ends_before_the_result_and_the_next_link_sends_no_submit() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	var submission = ports[1].submit({"type": "a"})
	h.last_socket().drop()
	h.step(1)
	assert_equal(submission.result, {"error": "The link closed."})
	h.step(500)
	h.connect_socket()
	h.welcome()
	h.step(10)
	assert_equal(h.last_socket().sent.size(), 1)
	assert_equal(h.sockets.size(), 2)
	var next = h.linked_events[1][1].submit({"type": "b"})
	assert_equal(Messages.parse(h.last_socket().sent[1])["request"], 1.0)
	assert_true(not next.done, "pending")


func test_a_port_of_an_ended_link_keeps_its_last_state() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	h.receive(_applied(4, {"counter": {"count": 8}}))
	h.last_socket().drop()
	h.step(1)
	assert_equal(ports[0].read()["counter"], {"count": 8.0})


func test_closing_a_port_closes_the_link() -> void:
	var h := Fake.Harness.new()
	var ports := h.link()
	ports[0].close()
	ports[1].close()
	h.poll_at(100000)
	assert_equal(h.sockets.size(), 1)
	assert_equal(h.sockets[0].close_count, 1)
	assert_equal(h.down_count, 0)
