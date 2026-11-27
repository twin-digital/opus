# Tasks

## Task 1: The package, the time subsystem, and the clock

Files: `nodejs/wishem/clock/package.json`, `nodejs/wishem/clock/tsconfig.options.json`, `nodejs/wishem/clock/README.md`, `nodejs/wishem/clock/src/index.ts`, `nodejs/wishem/clock/src/time.ts`, `nodejs/wishem/clock/src/time.test.ts`, `nodejs/wishem/clock/src/clock.ts`, `nodejs/wishem/clock/src/clock.test.ts`, `nodejs/wishem/clock/src/globals.d.ts`, `nodejs/wishem/clock/src/readme-example.test.ts`, the files that `pnpm sync` generates in `nodejs/wishem/clock/`, `pnpm-lock.yaml`, and the package list of the root `README.md`
Interfaces: consumes `createHub`, `ModelSubsystem`, `Port`, `Input`, and `InputRefusedError` of `@thrashplay/wishem-hub`; produces each export of the "Interfaces" section of `design.md`

- [ ] 1.1 Create `nodejs/wishem/clock` in the form of `nodejs/wishem/hub`: a `package.json` (`"private": true`, name `@thrashplay/wishem-clock`, a description, `type: module`, `exports`, and the dependency `@thrashplay/wishem-hub` with `workspace:*`), a `tsconfig.options.json` that is equal to the one of `nodejs/wishem/hub`, a `src/index.ts`, and one test file. Then run `pnpm install`, `pnpm sync`, and `pnpm update-readme`. Verify that `git status` shows changes only in `nodejs/wishem/clock/`, `pnpm-lock.yaml`, and the root `README.md`
- [ ] 1.2 Write `createTime` and `timeInputs` in `src/time.ts`. Write each test before its code, and see it fail first. The tests use a real hub. Verify that `src/time.test.ts` has one test for each scenario of the requirements "The time subsystem holds the time of a construct", "A tick advances the time", "An input pauses and resumes the construct", and "A controller can advance a construct with no clock" of `specs/wishem/clock/time/spec.md`
- [ ] 1.3 Write `startClock` in `src/clock.ts` and the two declarations in `src/globals.d.ts`. Write each test before its code, and see it fail first. The tests give a timer that the test calls and a source of real time that the test sets. Verify that `src/clock.test.ts` has one test for each scenario of the requirements "The clock sends ticks at normal speed while the construct runs", "The clock sends no tick during a pause", "The clock limits the ticks that it sends after a delay", and "The clock stops with the construct", and tests for: a port of an output subsystem, a joined state with no part `time`, a second `stop`, a `stop` inside a listener of an `applied` event, and one test of the default timer with the fake timers of vitest
- [ ] 1.4 Write `README.md` of the package: the two subsystems, the tick, pause, step, and the example of `design.md`. Use Simplified Technical English. Verify that the example in the document is the code of `src/readme-example.test.ts`, and that the test passes
- [ ] 1.5 Verify that `pnpm exec turbo run lint typecheck test build --filter @thrashplay/wishem-clock` passes. Add a temporary `import 'node:timers'` to `src/clock.ts`, verify that the build fails, and remove the import

## Workflow follow-up

- Break-test `@thrashplay/wishem-clock` before the final review.
- Add the changeset: `@thrashplay/wishem-clock`, minor.
- Archive the change, which puts the specification in `openspec/specs/wishem/clock/time/spec.md`.
- Open the pull request with `Closes #532`.
