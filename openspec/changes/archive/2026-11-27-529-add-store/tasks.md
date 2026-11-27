# Tasks

## Task 1: The store

Files: `nodejs/wishem/core/package.json` (the dependency), `nodejs/wishem/core/src/equality.ts`, `nodejs/wishem/core/src/core.ts`, `nodejs/wishem/core/src/store.ts`, `nodejs/wishem/core/src/store.test.ts`, `nodejs/wishem/core/src/store.hub.test.ts`, `nodejs/wishem/core/src/index.ts`, `nodejs/wishem/core/README.md`, `pnpm-lock.yaml`
Interfaces: consumes `ModelSubsystem`, `Input`, `InputRefusedError`, `InputProblem`, and `createHub` of `@thrashplay/wishem-hub`, and `validateModel`, `ModelError`, `Model`, `Entity`, `Id`, and `FieldValue` of this package; produces `createStore`, `storeInputs`, `StoreOptions`, `StoreInputs`, and the four payload types, as in the "Interfaces" section of `design.md`

- [x] 1.1 Add `@thrashplay/wishem-hub` as a dependency with `workspace:*` and run `pnpm install`. Move `canonical`, `deepFreeze`, and `isEqual` from `src/core.ts` to `src/equality.ts`. Verify that the tests of the package pass with no change to a test
- [x] 1.2 Write `createStore` with the first model and the input `replace-model`. Write each test before its code, and see it fail first. Verify that `src/store.test.ts` has one test for each scenario of the requirements "The store is a model subsystem that holds one model", "A store starts from a correct model or from an empty model", and "An input replaces the model" of `specs/wishem/core/store/spec.md`
- [x] 1.3 Write the inputs `add-entity`, `remove-entity`, and `set-field`, and `storeInputs`. Write each test before its code, and see it fail first. Verify with one test for each scenario of the requirements "An input adds an entity", "An input removes an entity", "An input sets a field value", and "The part of the store does not change in place", and with a test for each kind of payload fault: not an object, a missing key, a key of an incorrect type
- [x] 1.4 Write `src/store.hub.test.ts`, which uses the store in a real hub. Verify with one test for each scenario of the requirements "The store refuses an input that makes the model incorrect" and "The same inputs give the same model", and with the example of `design.md` as a test
- [x] 1.5 Add a section on the store to `README.md` of the package, with the example of `design.md`. Use Simplified Technical English. Verify that the example in the document is the code of the test of step 1.4
- [x] 1.6 Verify that `pnpm exec turbo run lint typecheck test build --filter @thrashplay/wishem-core` passes, and that `pnpm exec turbo run typecheck test --filter @thrashplay/wishem-host-nodejs --filter @thrashplay/wishem-workbench` passes

## Workflow follow-up

- Break-test `@thrashplay/wishem-core` before the final review.
- Add the changeset: `@thrashplay/wishem-core`, minor.
- Archive the change, which puts the specification in `openspec/specs/wishem/core/store/spec.md`.
- Open the pull request with `Closes #529`.
