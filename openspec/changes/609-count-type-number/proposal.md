---
issue: https://github.com/twin-digital/opus/issues/609
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The component type `Counter` of the sample product has the field `count` with the type `string`. The count rule reads the text as a decimal integer, adds 1 with `BigInt`, and writes text. The model has the field type `number` (#535). A count is a number, so the field must have the type `number`. Then a view, a renderer, and the construct manager get a number, and the rule needs no grammar of its own.

## What Changes

- The field `count` of the component type `Counter` in `nodejs/wishem/sample-product/model/` gets the type `number`. The first value in `state.json` is the number `0`.
- **BREAKING** (private package): the count rule `withCountRule` adds 1 to each `count` value that is a number. A `count` value that is not a number stays. A copy of the model folder that holds the text `"0"` is not correct after the change of the definition, because the value does not agree with the type `number`.
- The tests of `sample-product`, its README, and the specification `wishem/sample-product/model` give the count as a number.
- The signature of `withCountRule` does not change. The IDs do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/sample-product/model`: the field `count` has the type `number` and the first value `0`. The count rule adds 1 to each count that is a number.

## Impact

- `nodejs/wishem/sample-product/`: `model/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json`, `model/state.json`, `src/count-rule.ts`, `src/count-rule.test.ts`, `src/model.test.ts`, `src/readme-example.test.ts`, `README.md`.
- `openspec/specs/wishem/sample-product/model/spec.md`, through the delta of this change.
- A changeset for `@thrashplay/wishem-sample-product`.
- No other package changes on `main`. The tests of `host-nodejs` have their own definitions of a counter, and they do not read the sample product. The test of `workbench-app` copies the folder and counts only the definitions and the entities.
- The change #538 (construct manager, not merged) reads and writes the count as text in its tests. The second of the two changes to merge updates them. See "Order with other changes" in `design.md`.
