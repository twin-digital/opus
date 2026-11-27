# SDD ledger — plan: openspec/changes/535-add-view-inputs/tasks.md

Plan commit 6af27ec7 (planner on opus, with openspec-propose; it did the brainstorm alone and did not invoke superpowers:brainstorming). Five tasks. No task is dispatched yet.

## State at the end of the session of 2026-11-27

- The plan is committed and pushed. Apply has not started: no SDD workspace, no pre-flight scan, no brief.
- Next step: run the pre-flight scan of `superpowers:subagent-driven-development` (references/preflight.md) and write its table here, then dispatch Task 1.
- Create the issues of the section "Follow-up" of `design.md` before the apply step (six items: a list-of-references type, an input that clears a field, a sidecar rule for a reference that does not hold, the problem-path root of #557, rewind permission and undo of #582, #536 changing `count` to `number`).

## For the review issue of the milestone A3

- UI option A was selected (the title of the app bar is the control). Options B and C are in `design.md` under "UI options for the owner".
- Each view gets a reserved prop `wishem` with `setField` and `submit`; the renderer gets an optional second port `input`; the page opens one link with two subsystems and keeps one source ID for each page load.
- New field types: `number`, `boolean`, `reference`. The store refuses `remove-entity` for an entity that a different entity refers to.

## Files in common with other changes in work

- #536: the architecture document, `render.mjs`, the entity diagram SVGs, `glossary.md`, `concepts.md`, `workbench-app/README.md`, and the requirement "The entity diagram of the model folder" of `wishem/architecture/diagrams`. The second to archive must merge the requirement.
- #540: `workbench-app/src/hub-client.ts` (and `hub/src/link/connect-link.ts` if #540 merges first), the architecture document, `render.mjs`, `concepts.md`, `glossary.md`. Whichever merges second makes `connectLink` keep one ID for each client.
