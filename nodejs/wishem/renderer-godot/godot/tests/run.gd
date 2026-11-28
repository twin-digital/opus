extends SceneTree
## Runs each `test_*.gd` file of a folder. The first user argument selects the folder.

const DEFAULT_FOLDER := "res://tests"


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var folder: String = args[0] if args.size() > 0 else DEFAULT_FOLDER
	var files := _test_files(folder)
	var passed := 0
	var failed := 0
	for file in files:
		var script: Variant = load(folder.path_join(file))
		if script == null or not script is GDScript:
			print("FAIL %s load: the file does not load" % file)
			failed += 1
			continue
		for test_name in _test_names(script):
			var instance: Object = script.new()
			instance.call(test_name)
			var failures: Array = instance.get("failures")
			if failures.is_empty():
				print("PASS %s %s" % [file, test_name])
				passed += 1
			else:
				print("FAIL %s %s: %s" % [file, test_name, "; ".join(failures)])
				failed += 1
	if files.is_empty() or passed + failed == 0:
		print("wishem-godot tests: no test found in %s" % folder)
		failed += 1
	print("wishem-godot tests: %d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)


func _test_files(folder: String) -> Array[String]:
	var files: Array[String] = []
	for name in DirAccess.get_files_at(folder):
		if name.begins_with("test_") and name.ends_with(".gd"):
			files.append(name)
	files.sort()
	return files


func _test_names(script: GDScript) -> Array[String]:
	var names: Array[String] = []
	for method in script.get_script_method_list():
		if str(method.name).begins_with("test_"):
			names.append(method.name)
	names.sort()
	return names
