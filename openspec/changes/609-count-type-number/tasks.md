# Tasks

## Task 1: The count of the sample product is a number

Files: `nodejs/wishem/sample-product/src/model.test.ts`, `nodejs/wishem/sample-product/src/count-rule.test.ts`, `nodejs/wishem/sample-product/src/readme-example.test.ts`, `nodejs/wishem/sample-product/model/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json`, `nodejs/wishem/sample-product/model/state.json`, `nodejs/wishem/sample-product/src/count-rule.ts`, `nodejs/wishem/sample-product/README.md`, `.changeset/<new file>.md`
Interfaces: `withCountRule(store: ModelSubsystem<Model>): ModelSubsystem<Model>` keeps its signature. The field `fld_ef085a2e-22ef-4409-bac4-9cd5648d0705` of `ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d` has the type `number`.

Do not change the tests of `host-nodejs` (design.md, decision 4). Report each thing that is not in the scope of this task, and do not correct it.

- [ ] 1.1 Write the tests first. In `model.test.ts`: the definition of `Counter` gives `count` the type `number`; the first entity holds `{ [COUNT_FIELD]: 0 }` (the number); a copy of the model with the count `'8'` is not correct, and its problem names `count`, `Counter`, and `number`. In `count-rule.test.ts`: give the helper `entity` a value of the type `FieldValue | undefined`, and expect numbers: three ticks give `[3]`, `41` gives `42`, `[1, no counter, 9]` gives `[2, undefined, 10]`, the replay gives `[5]`, the rewind gives `[2]`, and the clock gives `[5]`. Replace the `it.each` of text values with an `it.each` of numbers: `-1` gives `0`, `0` gives `1`, and `1.5` gives `2.5`. Replace "keeps a count that is not a number" with a model whose definition of `Counter` gives `count` the type `string`: the counts `'many'` and `'5'` stay, and the part `time` has one tick. Replace "changes the one count that is a number, and keeps the other" with one entity that has a `Counter` component with no `count` key, and one entity with the count `5`: the result is `[undefined, 6]`. Add: a count of `2 ** 53` stays `2 ** 53`, and the tick is accepted. In `readme-example.test.ts`: expect the number `1`. Run `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm exec turbo run test --filter @thrashplay/wishem-sample-product`, and record in the report that these tests fail before the code changes.
- [ ] 1.2 Change the definition file of `Counter` to the type `number`, and `state.json` to the value `0` (no quotes). Change `withCountRule` to add 1 to each `count` that has the type `number` (`count + 1`), and keep each other value. Remove the regular expression and `BigInt`. Update the doc comment. Verify that the tests of 1.1 pass with the command of 1.1.
- [ ] 1.3 Update `README.md` of `sample-product`: the color is a string and the count is a number; the count rule adds 1 to each `count` of a `Counter` component that is a number, and other values stay; the comment of the example says that the count is now `1`. Verify that `readme-example.test.ts` passes.
- [ ] 1.4 Add a changeset that selects `@thrashplay/wishem-sample-product` with a minor bump, as "Package Impact" of design.md gives. Run lint and the type check: `flock -w 15 /tmp/wishem-heavy.lock timeout 140 pnpm exec turbo run lint typecheck --filter @thrashplay/wishem-sample-product`. Verify that both pass. Run `pnpm exec prettier --write` on each file that the task changed.

## Workflow follow-up

- Do the steps of "Order with other changes" in design.md before the final review.
- The final reviewer does "The test guide" of design.md.
- Archive the change. The archive updates `openspec/specs/wishem/sample-product/model/spec.md`.
- `sample-product` is not a library package of the break-test rules, so no break-test issue is necessary.
