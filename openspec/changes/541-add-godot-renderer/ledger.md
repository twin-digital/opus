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

## State at the end of the session of 2026-11-27

- NEXT STEP: the pre-flight scan of `superpowers:subagent-driven-development` (references/preflight.md), then Task 1.
- Create the issues of the section "Follow-up" of `design.md` before the apply step.
