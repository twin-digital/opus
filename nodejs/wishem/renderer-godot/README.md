# @thrashplay/wishem-renderer-godot

The Godot renderer of Wishem. The package holds a Godot project, a remote port of the link in GDScript, and the commands that run Godot in Docker.

## Godot runs only in Docker

No command installs Godot on your computer. Each command that needs Godot uses the image `wishem-godot:4.7.2-<12 hex digits>`.

- The image holds Godot 4.7.2, a virtual display (Xvfb), software OpenGL, and Node.js.
- The `Dockerfile` in `docker/` pins the base image and the SHA-512 sum of the Godot release.
- The tag changes when a file in `docker/` changes.
- A command builds the image when the Docker daemon does not have it.
- When `docker info` fails, a command prints a message and ends with exit code 1.

## Scripts

| Script        | Command                       | Docker | Purpose                                                 |
| ------------- | ----------------------------- | ------ | ------------------------------------------------------- |
| `godot:image` | `node scripts/godot.ts image` | Yes    | Build the image when it is missing.                     |
| `test`        | `opus-test`                   | No     | Run the Vitest tests of `src/`.                         |
| `test:godot`  | `node scripts/godot.ts test`  | Yes    | Run the GDScript tests in the image.                    |
| `test:ui`     | `pnpm test:godot`             | Yes    | Run the tests that need Docker (the CI job `ui-tests`). |

## GDScript tests

- Put each test file in `godot/tests/`. Name it `test_<topic>.gd`.
- Start the file with `extends "res://tests/check.gd"`.
- Name each test function `test_<behavior>`.
- Use `assert_equal(actual, expected, message)` and `assert_true(condition, message)`.
- `godot/tests/run.gd` runs each test and prints `PASS` or `FAIL` for each one, then `wishem-godot tests: <passed> passed, <failed> failed`.
- The runner ends with exit code 1 when a test fails or when it finds no test.
