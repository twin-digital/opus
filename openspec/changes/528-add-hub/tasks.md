# Tasks

## Task 1: The package, the hub, and the path of an input

Files: `nodejs/wishem/hub/package.json`, `nodejs/wishem/hub/tsconfig.options.json`, `nodejs/wishem/hub/README.md`, `nodejs/wishem/hub/src/index.ts`, `nodejs/wishem/hub/src/types.ts`, `nodejs/wishem/hub/src/names.ts`, `nodejs/wishem/hub/src/names.test.ts`, `nodejs/wishem/hub/src/hub.ts`, `nodejs/wishem/hub/src/hub.test.ts`, the files that `pnpm sync` generates in `nodejs/wishem/hub/`, `pnpm-lock.yaml`, and the package list of the root `README.md`
Interfaces: produces each export of the "Interfaces" section of `design.md`. In this task, `Port.subscribe` registers a listener that the hub does not call yet.

- [ ] 1.1 Create `nodejs/wishem/hub` with a `package.json` (`"private": true`, name `@thrashplay/wishem-hub`, a description, `type: module`, and `exports` in the form of `nodejs/wishem/core/package.json`), a `tsconfig.options.json` that is equal to the one of `nodejs/wishem/core`, and a `README.md`. Run `pnpm install`, `pnpm sync`, and `pnpm update-readme`. Verify that `git status` shows generated files only in `nodejs/wishem/hub/`, `pnpm-lock.yaml`, and the root `README.md`
- [ ] 1.2 Write the types of the "Interfaces" section of `design.md` in `src/types.ts`, and the checks of the form of an ID and of an input type in `src/names.ts`. Verify with tests in `src/names.test.ts` that cover correct and incorrect names
- [ ] 1.3 Write `createHub` in `src/hub.ts`: the check of the list of model subsystems, `status`, `start`, `stop`, `attach`, `Port.read`, `Port.close`, `Port.submit`, `Hub.read`, and `Hub.record`. Write each test before its code, and see it fail first. Verify that `src/hub.test.ts` has one test for each scenario of these requirements of `specs/wishem/hub/construct/spec.md`: "A hub is made from an ordered list of model subsystems", "An ID and an input type have a fixed form", "An I/O subsystem attaches to a hub and gets a port" (the scenario "A port is closed" is in Task 2), "Only an input subsystem sends inputs", "The hub gives an input to each model subsystem that declares its type", "The hub rejects an input that cannot be applied", "A failure in a model subsystem does not change the construct", "The hub keeps the record of the accepted inputs", "The payload of an input is JSON data", and "The joined state has one part for each model subsystem"
- [ ] 1.4 Verify that `pnpm exec turbo run lint typecheck test build --filter @thrashplay/wishem-hub` passes. Add a temporary `import 'node:fs'` to `src/hub.ts`, verify that the build fails, and remove the import

## Task 2: Events, the queue, and the documents

Files: `nodejs/wishem/hub/src/hub.ts`, `nodejs/wishem/hub/src/hub.events.test.ts`, `nodejs/wishem/hub/src/index.ts`, `nodejs/wishem/hub/README.md`
Interfaces: consumes `createHub`, `Hub`, `Port`, and `HubEvent` of Task 1; produces the full behavior of `Port.subscribe`, the events `started`, `applied`, and `stopping`, and `HubOptions.onError`

- [ ] 2.1 Make the hub call the listeners: `started` on the start, `applied` with the recorded input after each accepted input, and `stopping` on the stop. Call the ports in the order of attachment and the listeners of a port in the order of registration. A closed port and a removed listener get no event. Write each test before its code, and see it fail first. Verify that `src/hub.events.test.ts` has one test for each scenario of the requirements "The hub sends the events of the construct", "A hub starts one time and stops one time", and the scenario "A port is closed"
- [ ] 2.2 Add the queue: an input that arrives while the hub applies an input, or while the hub calls listeners, waits for its turn. An input that is in the queue when the hub stops gets the result `not-running`. Verify with tests for each scenario of the requirement "The hub applies inputs one at a time in the order of arrival"
- [ ] 2.3 Give each error of a listener to `onError`, and continue with the next listener. Verify with a test for the scenario of the requirement "A failure in a listener does not stop the hub"
- [ ] 2.4 Add a test for the requirement "The same inputs give the same joined state": two hubs get the same list of inputs, one of them has an output subsystem with a listener, and the joined states and the records are deeply equal
- [ ] 2.5 Write `README.md` of the package: what a hub is, the three kinds of subsystem, the port, the path of an input, and the example of `design.md`. Use Simplified Technical English. Verify that the example in the document is also a test that passes
- [ ] 2.6 Verify that `pnpm exec turbo run lint typecheck test build --filter @thrashplay/wishem-hub` passes

## Workflow follow-up

- Break-test `@thrashplay/wishem-hub` before the final review.
- Add the changeset: `@thrashplay/wishem-hub`, minor.
- Archive the change, which puts the specification in `openspec/specs/wishem/hub/construct/spec.md`.
- Open the pull request with `Closes #528`.
