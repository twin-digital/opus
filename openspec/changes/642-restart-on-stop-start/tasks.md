# Tasks

## Task 1: The start number in the construct list and in the construct manager

Files: `nodejs/wishem/construct-manager/src/construct-list.ts`, `nodejs/wishem/construct-manager/src/construct-list.test.ts`, `nodejs/wishem/construct-manager/src/construct-manager.ts`, `nodejs/wishem/construct-manager/src/construct-manager.test.ts`, `nodejs/wishem/construct-manager/README.md`, `nodejs/wishem/docs/glossary.md`, `.changeset/<name>.md`
Interfaces: produces `ConstructEntry.startSeq: number` (root entry of `@thrashplay/wishem-construct-manager`) and the internal `Live.startSeq`. `constructInputs`, `ReportPayload`, and `attachConstructManager` do not change.

- [ ] 1.1 Write the tests of the construct list first, and see them fail: a new start holds `startSeq` equal to the `seq` of the start in the record; a start of a stopped entry gets the `seq` of the new start and the status `pending`; a second start of a wanted entry returns the same part and keeps `startSeq`; a stop keeps `startSeq`; a report keeps `startSeq`; a replay of a record with starts, stops, and reports gives an equal part. Add `startSeq` to each existing `toEqual` of a full entry. Run `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm exec turbo run test --filter @thrashplay/wishem-construct-manager` and record the failures in the report.
- [ ] 1.2 Add `startSeq` to `ConstructEntry`, write it in `start` from `input.seq`, and keep it in `report`. Verify that the tests of 1.1 pass.
- [ ] 1.3 Write the tests of the construct manager first, and see them fail. (a) A stop and a start in one pass: start `play`, fire the clock three times, open a client on the old link, then send `constructs/stop` and `constructs/start` with `running: false` with no `await` between them (`await Promise.all([...])`). Expect a different `ProductConstruct` object, a new link that is different from the old one, the `stopping` event on the old client, a free old port, `hub.seq` of the new construct `0`, `ticks` `0` and `running` `false`, the count of the product model, and the log lines `wishem: construct play stopped` and then a second `wishem: construct play runs, link at ...`. (b) A rewind of the workbench to the state after the first start, after a stop and a second start: a new product construct with a new link, and `startSeq` equal to the first start. (c) A stop and a start that the hub applies while the first start runs: at the end, one live construct, the entry has the `startSeq` of the second start and the status `running` with the link of that live construct. (d) Two starts with no stop keep the same `ProductConstruct` object. Record the failures in the report.
- [ ] 1.4 Add `startSeq` to `Live` from the entry at the start, and make `reconcile()` stop a live construct whose entry has a different `startSeq`. Do not change `reportTruth()`. Verify with `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-construct-manager`: each test passes, also each test of #538.
- [ ] 1.5 Add `startSeq` to the field list of the README of `construct-manager` ("The sequence number, in the workbench record, of the `constructs/start` that wrote the entry") and to the row of `constructs/start` ("A new or stopped entry gets the status `pending` and the `startSeq` of the input"). Add "the sequence number of the start that wrote it" to the term **Construct list** of `nodejs/wishem/docs/glossary.md`, and keep its label. Verify that `readme-example.test.ts` passes in the run of 1.4.
- [ ] 1.6 Add one changeset with the rows of "Package Impact" of `design.md`: `@thrashplay/wishem-construct-manager` patch and `@thrashplay/wishem-workbench-app` patch. Run `pnpm exec prettier --write` on each file that the task changed, and verify with `pnpm exec prettier --check` on the same files.

## Task 2: `raw-link.mjs` sends more than one input

Files: `nodejs/wishem/docs/milestones/a1-construct/raw-link.mjs`, `nodejs/wishem/workbench-app/README.md` (only if its example of `raw-link.mjs` needs a change)
Interfaces: consumes the link protocol of `nodejs/wishem/hub/LINK.md`. Produces the option `--send` that can occur more than one time.

- [ ] 2.1 Make `send` of `parseArgs` `multiple: true`. After `welcome`, send each input as one `submit` with the request numbers 1, 2, ..., in one loop with no wait. With `--once`, close after the `result` of the last request. Update the usage comment of the file. With one `--send` and with no `--send`, the output stays the same.
- [ ] 2.2 Verify with real processes: build with `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm build --filter @thrashplay/wishem-workbench-app...`, start the workbench as in step 1 of "The test guide" of `design.md`, and do steps 2, 5, and 6. Record the output of each step in the report. Then stop the workbench. Run `pnpm exec prettier --write` and `pnpm exec prettier --check` on the changed files.

## Workflow follow-up

- The final reviewer does each step of "The test guide" of `design.md` on the branch and reports the result of each step.
- Before the push, do the steps of "Order with other changes" of `design.md` when #617 merged first.
- Archive the change.
- After the merge, create the break-test issue for `construct-manager` that "Follow-up" of `design.md` names.
