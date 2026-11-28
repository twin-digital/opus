extends RefCounted
## The messages of protocol version 1 of the link (`hub/LINK.md`). Static functions with no state.

const PROTOCOL := 1
const MAX_INTEGER := 9007199254740991

static var _id_pattern := RegEx.create_from_string("^[a-z][a-z0-9]*(-[a-z0-9]+)*$")


## `subsystems` is a list of `{ "id": String, "kind": "input" | "output" }`.
static func hello(subsystems: Array) -> Dictionary:
	var items: Array = []
	for subsystem: Dictionary in subsystems:
		items.append({"id": subsystem["id"], "kind": subsystem["kind"]})
	return {"t": "hello", "protocol": PROTOCOL, "subsystems": items}


static func submit(request: int, subsystem: String, input: Dictionary) -> Dictionary:
	return {"t": "submit", "request": request, "subsystem": subsystem, "input": input}


## Gives the JSON object with a text `t`, or an empty dictionary.
static func parse(text: String) -> Dictionary:
	var json := JSON.new()
	if json.parse(text) != OK:
		return {}
	var value: Variant = json.data
	if typeof(value) != TYPE_DICTIONARY:
		return {}
	var message: Dictionary = value
	if typeof(message.get("t")) != TYPE_STRING:
		return {}
	return message


static func is_id(id: String) -> bool:
	return _id_pattern.search(id) != null


## Gives `<prefix>-<16 lowercase hex digits>`.
static func new_id(prefix: String) -> String:
	return "%s-%s" % [prefix, Crypto.new().generate_random_bytes(8).hex_encode()]


## Gives an integer for an integer or a whole float from 0, and `null` for each other value.
static func as_int(value: Variant) -> Variant:
	if typeof(value) == TYPE_INT:
		return value if int(value) >= 0 else null
	if typeof(value) != TYPE_FLOAT:
		return null
	var number: float = value
	if not is_finite(number) or absf(number) > float(MAX_INTEGER) or floorf(number) != number or number < 0.0:
		return null
	return int(number)
