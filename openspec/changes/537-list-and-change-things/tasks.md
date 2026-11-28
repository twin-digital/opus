# Tasks

Each task starts with its tests. The implementer report shows a failing run of the new tests before the code. Run lint, the type check, and the tests only for the packages of the task, under the lock of `nodejs/wishem/CLAUDE.md`. A UI task runs `test:ui:update` and then `test:ui` for `@thrashplay/wishem-workbench-app` (Docker is necessary).

## Task 1: The rule of the outcome for a part of a page that is not a view

Files: `nodejs/wishem/renderer-react/src/view-tools.ts`, `src/view-tools.test.ts`, `src/index.ts`, `src/index.test.ts`, `README.md`; `nodejs/wishem/workbench-app/src/views/outcome-text.ts` (moved to `src/outcome-text.ts`), `src/views/outcome-text.test.ts` (moved to `src/outcome-text.test.ts`), `src/views/AppBar.tsx`
Interfaces: produces `sendInput(input: InputPort | undefined, message: Input): Promise<InputOutcome>` of `@thrashplay/wishem-renderer-react`, and `outcomeText(outcome, subject = 'the title')` in `workbench-app/src/outcome-text.ts` (design.md, "Interfaces", Decisions 4 and 5)

- [ ] 1.1 Write the tests of `sendInput`: the outcome of the hub for an accepted and for a refused input, `unknown` for a `LinkClosedError`, `failed` for each other error, and `not-permitted` with no port and no call of `submit`. The test of the root entry names the export. Verify that they fail.
- [ ] 1.2 Make the private `send` of `view-tools.ts` the export `sendInput`, and use it in `createViewTools`. Verify that the new tests and each test of `renderer-react` pass, with no change of a test of `createViewTools` or of `stubViewTools`.
- [ ] 1.3 Add `sendInput` to the README of `renderer-react` (one paragraph and one example), and verify that the README example test, if one covers the exports, passes.
- [ ] 1.4 Move `outcome-text.ts` and its test to `workbench-app/src/`. Write the test for the parameter `subject` (`unknown` with `'the value'` gives `The connection ended before an answer. Look at the value after it connects.`) and for the default (the text of the title does not change). Verify that it fails, then add the parameter, change the import of `src/views/AppBar.tsx`, and verify that each test of `workbench-app` passes.
- [ ] 1.5 Verify that lint and the type check pass for `@thrashplay/wishem-renderer-react` and `@thrashplay/wishem-workbench-app`.

## Task 2: The field row

Files: `nodejs/wishem/workbench-app/src/components/FieldRow.tsx`, `src/components/FieldRow.test.tsx`, `src/style-guide/sections/Components.tsx`, `tests/style-guide.spec.ts` (only if a specimen needs a new check), `tests/__screenshots__/components-light.png`, `components-dark.png`
Interfaces: produces `FieldRow`, `FieldRowProps`, `ChangeOutcome`, `ReferenceOption` (design.md, "Interfaces"); consumes the types of `@thrashplay/wishem-core` only

- [ ] 2.1 Write the unit tests of `FieldRow` from the specification `wishem/design-system/component-catalog` ("The field row", "The field row shows the state of a change") and the rows of Decision 7: each control and its accessible name, the mono label of the type, `no value`, Enter and the move of the focus commit one time, Escape restores the value and keeps the focus, the same value calls nothing, the empty and the non-finite number text give `Type a number.` with no call, a check box and a select call at each change, "saving" (`aria-busy`, read-only or disabled, `Saving`), "not saved" (role `alert`, the value of the designer stays), a new commit after a rejection, no `onChange` gives a disabled control, a draft stays when the prop `value` changes, a removal while it saves gives no error, and the `initial` states. Verify that they fail.
- [ ] 2.2 Build `FieldRow` with roles only (design.md, "UI", "New components"). Verify that the unit tests and `src/components/no-raw-colors.test.ts` pass.
- [ ] 2.3 Add the specimens "Field row, string", "Field row, number", "Field row, boolean", "Field row, reference", "Field row, no value", "Field row, saving", "Field row, not saved", and "Field row, disabled" to the components section of the style guide. Run `test:ui:update`, look at the two new images of the components section, then verify that `test:ui` passes (screenshots and axe in each theme) and that no other baseline changed.
- [ ] 2.4 Verify that lint, the type check, and the tests of `@thrashplay/wishem-workbench-app` pass.

## Task 3: The entity list, the inspector, and the product panel

Files: `nodejs/wishem/workbench-app/src/components/EntityList.tsx`, `EntityInspector.tsx`, `ProductPanel.tsx`, their `*.test.tsx` files, `src/components/entity-name.ts`, `src/components/entity-name.test.ts`, `src/style-guide/sections/Components.tsx`, `tests/__screenshots__/components-light.png`, `components-dark.png`
Interfaces: consumes `FieldRow` of Task 2; produces `EntityList`, `EntityInspector`, `ProductPanel` and their props, `entityName`, and `shortId` (design.md, "Interfaces", Decision 6)

- [ ] 3.1 Write the tests of `entityName` and `shortId` (the sample entity gives `Counter, Color` and `e_99969ed3`; the test fixture uses its own order of definitions, `No components`). Write the unit tests of `EntityList` (one button for each item, `aria-current` on the selected item only, Enter and Space call `onSelect` and keep the focus, the zero state `No entities yet.`, the `nav` named `Entities`), of `EntityInspector` (the heading, the full ID, one `fieldset` for each component in the order of the definitions with its `legend`, one row for each field, the zero state `Select an entity to change it.`, `onChange` gets the component type and the field), and of `ProductPanel` (the items, the options `<name> · <short ID>` of each reference row, the selection, and `onChange` with a `SetFieldPayload`). Verify that they fail.
- [ ] 3.2 Build the three components and the two functions with roles only, with the layout of "UI" (two columns from 768 pixels, one column below it). Verify that the unit tests and `no-raw-colors.test.ts` pass.
- [ ] 3.3 Add the specimens "Entity list", "Entity list, selected", "Entity list, empty", "Inspector, nothing selected", "Inspector, an entity", and "Product panel" (720 pixels wide) to the style guide. Run `test:ui:update`, look at the images, and verify that `test:ui` passes and that only the baselines of the components section changed.
- [ ] 3.4 Verify that lint, the type check, and the tests of `@thrashplay/wishem-workbench-app` pass.

## Task 4: The product panel in the page

Files: `nodejs/wishem/workbench-app/src/tools/ProductTool.tsx`, `src/tools/ProductTool.test.tsx`, `src/tools/use-part.ts`, `src/tools/use-part.test.tsx`, `src/Page.tsx`, `src/Page.test.tsx`, `scripts/e2e-server.ts`, `playwright.config.ts`, `tests/product.spec.ts`, `tests/__screenshots__/product-light.png`, `product-dark.png`, `README.md`; `.gitignore` (the two entries of Decision 10); `nodejs/wishem/docs/architecture/README.md`, `render.mjs`, `components-page-light.svg`, `components-page-dark.svg`; `nodejs/wishem/docs/glossary.md`, `nodejs/wishem/docs/concepts.md`
Interfaces: consumes `sendInput` and `outcomeText` of Task 1, and `ProductPanel` of Task 3; produces `ProductTool`, `usePart`, and the Playwright project `product` on the page port 4181

- [ ] 4.1 Write the unit tests with a real hub (`createHub` with a store `store` and a store `product`), as `Page.test.tsx` does: `usePart` draws again only when the part changes by identity; `Page` shows the product panel and no zero state with a part `product`, and the zero state with no part `product`; a commit sends one input with the type `product/set-field` that equals `storeInputs('product').setField(...).type`, through the input port, and the hub records the source of that port; the outcome `not-running` gives the text of the specification; a removal of the selected entity clears the selection and moves the focus to the list; the tool reads no part other than `product`. Verify that they fail.
- [ ] 4.2 Build `usePart`, `ProductTool`, and the change of `Page` (Decisions 1, 2, 3, and 9). Verify that the unit tests and each test of `workbench-app` pass.
- [ ] 4.3 Write `tests/product.spec.ts` for the project `product`: the list and the inspector of the sample entity; a commit of the count gives the value in the page, in `.e2e-product/state.json`, and in the record with a source `page-<16 hex>-input` (a listener as `watchLink` of `workbench.spec.ts`, on port 4181); a hand edit of `.e2e-product/state.json` shows with no reload; a rewind through a client of the link restores the value and the file; the text `ten` gives the alert and no input; the screenshot and the axe check of the page with the sample entity selected, in each theme; a viewport 390 pixels wide has no horizontal scroll. Add `--product` to `scripts/e2e-server.ts`, the second web server and the project to `playwright.config.ts`, and the `.gitignore` entries. Verify that the new tests fail before 4.2 is in place, or report why they cannot (the server needs 4.2).
- [ ] 4.4 Run `test:ui:update`, look at `product-light.png` and `product-dark.png`, and verify that `test:ui` passes in the three projects and that the baselines of the projects `style-guide` and `workbench` did not change.
- [ ] 4.5 Change the component diagram of the page in `render.mjs` (the component "Product panel", its two relationships, the description of the catalog, and the description of the diagram), as "The architecture document" of design.md says. Run `node nodejs/wishem/docs/architecture/render.mjs`, and look at `components-page-light.svg` and `components-page-dark.svg` in each theme, with the `diagrams` skill. Verify that no other SVG file changed. Change the alt text, the text, and the table of the component diagram in the architecture README.
- [ ] 4.6 Change the README of `workbench-app` (the paragraph "The page ignores the part `product`" and a section "The product panel"), `glossary.md` (**Product panel** and the sentence of **Tool**, each **Proposed**), and `concepts.md` ("Tools" and "Views"), as Decision 12 says. Verify that `pnpm exec prettier --check` passes on each changed file.
- [ ] 4.7 Verify that lint, the type check, and the tests of `@thrashplay/wishem-workbench-app` pass.

## Task 5: The page driver of the test guide

Files: `nodejs/wishem/docs/milestones/a4-workbench/page-driver.mjs`
Interfaces: consumes `scripts/browser-server.ts` (`WISHEM_BROWSER_WS_ENDPOINT`) and the accessible names of Tasks 2 to 4; produces the command and the output of "Interfaces" in design.md

- [ ] 5.1 Write `page-driver.mjs` with the usage, the steps, the output, and the exit codes of design.md, "Interfaces". It finds `@playwright/test` with `createRequire` from the working folder, connects with `exposeNetwork: '<loopback>'`, and finds a row by its group and its accessible name.
- [ ] 5.2 Verify it with the real workbench: run the steps 0 to 7 and 12 of "The test guide" of design.md, and report the real output of each step. A step that does not give its result is a finding: correct the script, or report a fault of Tasks 2 to 4.
- [ ] 5.3 Verify that a step with a wrong short ID prints `error: <message>` and ends with exit code 1, and that `pnpm exec prettier --check` passes on the script.

## Workflow follow-up

- Add one changeset that selects `@thrashplay/wishem-workbench-app` (minor) and `@thrashplay/wishem-renderer-react` (minor), as "Package Impact" says.
- The final reviewer does each step of "The test guide" in design.md on the branch.
- Archive the change, then open the pull request with `superpowers:finishing-a-development-branch`.
- After the merge, create the break-test issue of `renderer-react`, if the list of library packages of `autonomous-flow.md` names it, and follow "Order with other changes" when #617 merges second.
