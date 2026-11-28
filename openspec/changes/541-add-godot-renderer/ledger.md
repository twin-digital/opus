# SDD ledger — plan: openspec/changes/541-add-godot-renderer/tasks.md

Plan commit dffff9d9 (planner on opus, with openspec-propose). Seven tasks. No task is dispatched yet. The planner found no question that meets the three conditions for the owner.

## For the review issue of the milestone A5

- The Docker daemon of the workspace is remote (`ssh://prod-development-docker`), so the container of Godot cannot reach `127.0.0.1` of the construct. The runner carries the bytes of the link through `docker exec -i`. Host networking and the construct in the container were rejected.
- Godot renders under a virtual display with software rendering. `--headless` draws no pixels.
- UI option A was selected: the color only, and the state of the link as lines in the terminal. The other options are in `design.md` under "UI options for the owner".
- The construct of the Godot application runs on port 4749 and uses `serveHub` of #540.

## Order with other changes

- #540: Tasks 4 and 7 use what #540 adds (`serveHub`, the construct of `pixi-page`, the section of `LINK.md` about a client that connects again). Merge #540 first. Tasks 1 to 3 can start before. Archive this change after #540.
- The planner found two faults of #540 (recorded in the ledger of #540): its delta of `architecture/diagrams` has no scenario "The clock package builds on the hub package", and its diagram has no relationship from the PixiJS process to `hub`.

Follow-up issues of design.md (created 2026-11-27, before apply): #611 the hub side refuses a binary message, #612 generated types of the props of a Godot view, #613 an input subsystem in the Godot application, #614 a cache of the Godot image for ui-tests (a CI change needs the owner). #542 got a comment. #541 is blocked by #540 (a relation), for Tasks 4 to 7.

## Pre-flight scan

| Row                   | Checked                                                                                                                                         | Found                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Task 1 x Task 2, 3, 5 | Task 1 produces the image, `ensureImage`, `DockerCli`, and the GDScript runner (`run.gd`, `check.gd`); the others consume them                  | Names agree with "Interfaces" of design.md.                                                                        |
| Task 1 x Task 5       | Task 1 writes `docker/relay.mjs` as a stub; Task 5 completes it; both change `scripts/godot.ts`                                                 | In order. A change of `docker/` changes the image tag, so Task 5 builds the image again (by design of `imageTag`). |
| Task 1 x Task 6       | Task 1 sets `test:ui` to `pnpm test:godot`; Task 6 adds `node --test tests/`                                                                    | In order.                                                                                                          |
| Task 2 x Task 3       | Task 3 consumes `read` and `subscribe` of `remote_port.gd`; it tests with `fake_port.gd`                                                        | Agrees.                                                                                                            |
| Task 2 x Task 7       | Task 2 records the gaps of `LINK.md`; Task 7 corrects `LINK.md`                                                                                 | The lead carries the gaps of the reports of Tasks 2 and 5 into the dispatch of Task 7.                             |
| Task 3 x Task 4       | Task 3 makes the ID of the component type of `ClearColor`; Task 4 uses it as `CLEAR_COLOR_TYPE`                                                 | The lead carries the ID from the report of Task 3 into the dispatch of Task 4.                                     |
| Task 4 x change #540  | Task 4 consumes `serveHub` of `host-nodejs` and copies the form of `pixi-page/src/construct`                                                    | Task 4 starts after #540 is merged (the plan says so).                                                             |
| Task 5 x Task 4       | Task 5 uses `startGodotConstruct` in its tests                                                                                                  | Task 5 waits for Task 4, and so for #540.                                                                          |
| Task 6 x Tasks 4, 5   | The screenshot test uses the construct and `runGodot`                                                                                           | In order.                                                                                                          |
| Task 7 x change #540  | Both change `LINK.md`, `CLAUDE.md`, `concepts.md`, `glossary.md`, the architecture document, and the delta of `architecture/diagrams`           | Task 7 starts after #540 is merged and merges main first; 7.4 writes the delta again on the text of main.          |
| Task 1 alone          | Changes `turbo.json` and `.gitignore` (Wishem entries: permitted); 1.2 downloads the release of Godot and builds through a remote Docker daemon | Agrees. The remote daemon can fail with "Too many authentication failures" of SSH: the implementer reports it.     |
| Task 2 alone          | GDScript from `LINK.md` only                                                                                                                    | Agrees.                                                                                                            |
| Task 3 alone          | Tests with `--headless`; reads the tests of `renderer-react` and does not change them                                                           | Agrees.                                                                                                            |
| Task 4 alone          | The scratch program of 4.4 builds `hub` if `dist/` is missing                                                                                   | Agrees.                                                                                                            |
| Task 5 alone          | 5.4 runs two real processes from one scratch program                                                                                            | Agrees with the rule of no background work.                                                                        |
| Task 6 alone          | 6.2 changes `renderer.gd` and `link_client.gd` for a moment and restores them                                                                   | A check that leaves no file; `git diff` verifies. Agrees.                                                          |
| Task 7 alone          | Changes only `LINK.md` of `hub` (no code)                                                                                                       | Agrees; no break-test issue for `hub`.                                                                             |

No conflict that needs a ruling. Order: Tasks 1, 2, 3 now; Tasks 4 to 7 after #540 is merged.

## Tasks

Task 1: dispatched (implementer: sonnet), base f9c1cf16

Task 1: implementer DONE_WITH_CONCERNS, commit 7f3c12a2 (8 Vitest tests; lint, typecheck, test pass; the GDScript runner gives PASS, FAIL, and the exit codes of 1.4; image wishem-godot:4.7.2-67420666438d). Probe 1.3: each fact agrees with design.md. Concerns: `godot --version` prints `4.7.2.stable.official.ed1daf0bf` (it starts with `4.7.2.stable`); Godot under Xvfb prints noise of audio, libdbus, and libpulse (`--audio-driver Dummy` would stop it); two files outside the file list (tsconfig.options.json for `.ts` imports in scripts/, eslint.config.d/10-ignores.js for docker, godot, shots, .out), needed for lint and typecheck; no gap of LINK.md. The concerns are observations, so review dispatched (sonnet).

Task 1: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify, checked by the lead: the scenario "Docker is not available" of renderer-godot/application gives the message and exit code 1, as the code does; ci.yaml runs `turbo run test:ui --affected` (line 103), as the README says; `pnpm sync` keeps tsconfig.options.json and eslint.config.d/10-ignores.js (no change after sync); the probe facts and the GDScript runs are in the report. No gap.
Task 1: minor (deferred): a test_*.gd file with no test function passes when other files have tests; the version of Godot is in docker.ts and in the Dockerfile with no test that ties them; imageTag uses slice(dir.length + 1) and join (a trailing slash or Windows separators change the hash); `docker cp` copies a local godot/.godot/ cache into the container; a SIGINT can leave the container; no test of createDockerCli; the noise of audio, libdbus, and libpulse under Xvfb (`--audio-driver Dummy`).
Task 1: complete (commits f9c1cf1..7f3c12a, review clean)

Task 2: dispatched (implementer: sonnet), base 0092a39f

Task 2: implementer DONE_WITH_CONCERNS, commit ebb14942 (test:godot 57 passed, 0 failed; lint, typecheck, test pass, 9 Vitest tests; two deliberate faults in link_client.gd made the wait, down-count, and same-object tests fail, then reverted). Concerns: run.gd (Task 1) does not count a test file with a parse error as a failure; tested only against a fake WebSocketPeer (a real round trip is in Task 6); bad options go to an `error` member, not push_error; a close of a port closes the whole link client; seven new gaps of LINK.md, 8 to 14 in the report (the exact ID form, malformed result/event/applied/welcome, the retry after refused, the Origin header of a native client) — for Task 7; the fixture script needs `node --conditions=source`. Review dispatched (sonnet).

Task 2: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify: the real WebSocketPeer (the 4 MiB inbound_buffer_size, STATE_CLOSING, was_string_packet) — the real round trip is in Tasks 5 and 6; the 57 tests from the report. No gap for this task.
Task 2: minor (deferred): _send_submit ignores the result of send_text (a failed send leaves the submission pending until the link ends); no timeout of `welcome` and no keepalive (gap 6; carry to Task 5); the check of the phase in _send_submit repeats `_link.ended`; the runner run.gd counts neither a file that does not load nor a file with no test as a failure (a fault of Task 1: carry to the final review); the report counts 15 tests of link_messages, the review counts 14.
For Task 7: the gaps of LINK.md are 1 to 7 of Decision 14 and 8 to 14 of the report of Task 2.
Task 2: complete (commits 0092a39..ebb1494, review clean)

Task 3: dispatched (implementer: sonnet), base 2ffd012a

Task 3: implementer DONE_WITH_CONCERNS, commits fc0fe3a2, 91b9c981 (test:godot 103 passed, no SCRIPT ERROR line; one expected push_error). The ID of the component type of ClearColor (for Task 4): ct_c47a0a86-b82f-43a8-8b0b-31a1e4ef6f37. Concerns: (1) the fixture godot/tests/views/bad_json/Box.view.json is invalid JSON on purpose, and Prettier cannot parse it (the root .prettierignore is not a permitted place); (2) the runner counts a test that stops on a runtime SCRIPT ERROR as PASS; (3) choices: an empty field name gives no prop (React keeps ""), two sidecars of one component type are both dropped, a failed create is not tried again until the component is gone; (4) extra: Views.collect_from(folder, names) and a public renderer.errors; no gap of LINK.md.
Ruling: (1) the merge-checks of the pull request run `prettier --check` on each changed file, so the committed invalid fixture fails a check, and the root .prettierignore needs the owner; the test writes the invalid sidecar at run time in a temporary folder of Godot, and the fixture file is removed — cost if wrong: one test setup. (2) is load-bearing for each later GDScript test: `test:godot` (scripts/godot.ts) ends with exit code 1 when the output of Godot has a line with `SCRIPT ERROR`, with a test of the runner — cost if wrong: one check in the Node.js runner. Both are fixed before the review. (3) and (4) go to the review as facts.
Task 3: fix dispatched (new implementer, sonnet), base 91b9c981.

Task 3: correction, commit fc7b0468 (the invalid sidecar is written at run time; test:godot scans stdout and stderr and ends with exit 1 for a SCRIPT ERROR line — a real fault gave exit 1; spawn of docker.ts now pipes stderr, ChildProcessLike has stderr; 103 passed, 0 failed; Vitest 13; prettier --check passes). Open: a test file that does not load may still not count as a failure (not checked whether it prints SCRIPT ERROR). Review dispatched (sonnet), range 2ffd012a..fc7b0468.

Task 3: review (sonnet): spec compliant, quality Approved, no Critical or Important. Items it could not verify: the ID of ClearColor for Task 4 (recorded above: ct_c47a0a86-b82f-43a8-8b0b-31a1e4ef6f37); the 0-failed run (in the report); an empty field name gives no prop with no signal, while renderer-react reports `empty-name`.
Ruling: the empty field name stays as built (no prop) in this task, and goes to the final review for the parity of the three renderers (#542) — the spec is silent, and no view of this change has such a field — cost if wrong: one error message later.
Task 3: minor (deferred): _node_for scans each entry for each item (O(n²) per sync; index by key); push_error of the expected failures prints ERROR lines in test:godot (expected noise); _layer.free() needs is_instance_valid; no test of a third sidecar of one type; field names use ASCII [A-Za-z0-9] only (compare with field-names.ts of renderer-react); no TypeScript test of the stderr wiring of godot.ts; a test file that does not load may not count as a failure in run.gd.
Task 3: complete (commits 2ffd012..fc7b046, review clean)

#540 is merged (ced6862a). Main merged (6f6536eb; README.md and pnpm-lock.yaml made again with pnpm install and update-readme; sync gives no change). The relation "blocked by #540" is removed. Task 4: dispatched (implementer: sonnet), base 6f6536eb.

Task 4: implementer DONE_WITH_CONCERNS, commit 94a237e2 (57 tests; lint, typecheck pass; 4.4: --paused, rewind-client gives #1d4ed8, SIGINT exit 0). Concerns: scripts/start.ts exports no function (start.test.ts tests the spawned process only); the start test needs dist/ of the workspace dependencies (CI builds first); no gap of LINK.md. Review dispatched (sonnet).

Task 4: review (sonnet): spec compliant, quality Approved, no Critical. Items it could not verify, checked by the lead: each of the 11 scenarios of renderer-godot/construct has a test (the scenario "The PixiJS page runs at the same time" is the test "runs next to a second construct"); the 4.4 run is in the report.
Ruling: the plan-mandated duplication of the construct of pixi-page (color-rule, create-hub, process, and their tests) is accepted — design.md mandates it, and #542 joins the two constructs into one — cost if wrong: two copies until #542.
Task 4: minor (deferred): the signal handlers are registered after startGodotConstruct resolves (a signal during the start uses the default action); a message for an invalid --port that the spec does not name; `.ts` imports in create-hub.ts and process.ts (needed for type stripping) next to `.js` in the tests; COLOR_FIELD and SCREEN_ENTITY have no doc comments.
Task 4: complete (commits 6f6536e..94a237e, review clean)
Task 5: dispatched (implementer: sonnet), base 4876f3a1

Task 5: implementer DONE_WITH_CONCERNS, commits 6753803e, 38661342 (72 tests; lint, typecheck pass; test:godot 116 passed, 0 failed). Real run of 5.4 two times: the lines of steps 3, 4, 11, 12, 14; shots/0001.png 640x360, each pixel #1d4ed8; `connected (link 2)` after the restart; SIGINT exit 0; no container stays. 5.5 passes. Concerns: test:godot prints leak warnings at exit; a public `seq()` in link_client.gd (the shot line needs the seq of `welcome`; a gap of LINK.md); the container command has no `exec` (xvfb-run as PID 1 does not start Godot); the import is in the container command; `flush_stdout_on_print=true` in project.godot (maybe not needed); a synchronous `docker cp` blocks the runner and the relay during a copy; the shot line has the absolute local path, not the path of "Examples"; GodotConstruct has `url` and `linkUrl`, not `port`. Review dispatched (sonnet).

Task 5: review (sonnet): needs fixes. Important F1: run-godot.ts ignores the result of `docker cp`, so a failed copy still logs `shot ... file <local>` for a file that does not exist. Spec gap F2: the shot line has the absolute local path; "Examples" of design.md give a path relative to the repository. Items it could not verify: the text of "Examples" and "Interfaces" (the lead checks with the fix); test_main.gd does not cover _ready or _shoot (the real run is the evidence); the changeset (at the finish); the public seq() of link_client.gd for LINK.md (Task 7).
Ruling: F2 — the absolute path stays (exact from any working folder); the example of design.md changes to it, with openspec-update-change — cost if wrong: the text of one line.
Ruling: the minor M-relay (relay.mjs reads stdin only after a connection, so an idle inner relay does not end on stdin.end(), waits for kill(), and can stay in the container) goes into the fix round, because it affects Ctrl+C in the test guide — cost if wrong: one line and one test.
Task 5: minor (deferred): the synchronous `docker cp` blocks the runner and the relay during a copy (use docker.spawn); no handling of backpressure in the relay; the output of `--import` goes to /dev/null and its status is ignored; the signal handlers of scripts/godot.ts are installed after runGodot returns; time-client.mjs ends with 0 when the result is not ok; `new Promise` around a synchronous startRun; emptyFolder removes each entry of a caller-supplied shotsDir; leak warnings at the exit of test:godot.
Task 5: fix round 1 dispatched (new implementer, sonnet), base 38661342.

Task 5: fix round 1/5 (3 addressed, 0 open — F1, F2, M-relay; commits 3866134..9e10af8; 74 tests; test:godot 116 passed). Re-review (sonnet): no new breakage; no data of stdin is lost (the runner writes only after a socket connects).
Task 5: minor (deferred): the test of an idle relay has a limit of 700 ms against the kill time of 1000 ms (can be fragile on a loaded computer).
Task 5: complete (commits 4876f3a..9e10af8, review clean)

## State at the end of the session of 2026-11-27

- NEXT STEP: Task 6 (the screenshot test). Then Task 7 (LINK.md and the documents; carry the gaps of Decision 14, of the report of Task 2 (8 to 14), and `seq()` of link_client.gd from Task 5). Tasks 4 to 7 wait for the merge of #540.
