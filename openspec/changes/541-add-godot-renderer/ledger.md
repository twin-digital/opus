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

## State at the end of the session of 2026-11-27

- NEXT STEP: Task 2 (the remote port in GDScript). Then Task 3. Tasks 4 to 7 wait for the merge of #540.
