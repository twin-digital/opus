---
issue: https://github.com/twin-digital/opus/issues/537
milestone: https://github.com/twin-digital/opus/milestone/18
---

# Proposal

## Why

The workbench construct mounts a product (#536) and runs its constructs (#538), but the page of the workbench does not show the product. The designer can change the authored state of the product only with a text editor or a client of the link. The milestone "A4 Workbench and product" needs a tool in the page that lists the entities of the product and changes their field values, so that #539 can show each change in a running product construct.

## What Changes

- **The product panel.** When the joined state has the part `product`, the page shows the product panel below the app bar, in the space of the zero state. The panel has two columns: the list of the entities of the product, and the inspector of the selected entity. With no part `product`, the page shows the zero state, as now.
- **The list of entities.** Each item gives the labels of the component types of the entity and the short form of its ID (`e_99969ed3`). The designer selects one item. The list follows each change of the part `product` with no reload.
- **The inspector.** It shows one group for each component of the selected entity, with one row for each field of its component type: the label, the type, and a control for the type. A `string` field and a `number` field have a text field. A `boolean` field has a check box. A `reference` field has a select of the entities of the product.
- **A change of one field value.** A commit in the inspector sends one `product/set-field` input through the input port of the page. The hub records it with the source `page-<hex>-input`. The storage subsystem of the product writes `state.json`, and the construct manager gives the change to each running product construct. Each row shows the states "saving" and "not saved" with the reason, as the title of the app bar does.
- **New catalog components** `EntityList`, `FieldRow`, `EntityInspector`, and `ProductPanel`, each in the style guide in each state and in each theme, with screenshot tests and accessibility tests. No design token is added.
- **The Playwright tests** get a second workbench server with a copy of the sample product, and a test file for the product panel. The baselines of the page with no product do not change.
- `@thrashplay/wishem-renderer-react` exports `sendInput`: the rule that gives each input one outcome and never rejects. The views and the product panel use the same rule.
- The component diagram of the page shows the product panel. The glossary and the concepts describe the product panel as a tool that is derived from the declarations.
- A script of the milestone `a4-workbench`, `page-driver.mjs`, drives the page in the pinned web browser in Docker, for the test guide.

## Capabilities

### New Capabilities

- `wishem/workbench/product-panel`: the tool of the workbench page that lists the entities of the mounted product and changes one field value: what the list and the inspector show, the controls for each field type, the input that a commit sends, the states of a change, and how the panel follows the part `product`.

### Modified Capabilities

- `wishem/renderer-html/page`: with the part `product`, the page shows the product panel in the space of the zero state, and the page also sends the inputs of the product panel.
- `wishem/renderer-html/views`: the package exports the rule of the outcome of an input, for a part of a page that is not a view.
- `wishem/design-system/component-catalog`: the new components, their states, and the behavior of a field row.
- `wishem/workbench/start`: with a mounted product, the page shows the product panel.
- `wishem/architecture/diagrams`: the component diagram of the page shows the product panel and its relationships.

## Impact

- `nodejs/wishem/workbench-app`: new `src/components/EntityList.tsx`, `FieldRow.tsx`, `EntityInspector.tsx`, `ProductPanel.tsx`, new `src/tools/ProductTool.tsx`, `src/tools/use-part.ts`, `src/tools/entity-name.ts`, their tests; `src/Page.tsx`, `src/views/outcome-text.ts`, the style guide (`src/style-guide/sections/Components.tsx`), `scripts/e2e-server.ts`, `playwright.config.ts`, new `tests/product.spec.ts`, the screenshot baselines, and the README.
- `nodejs/wishem/renderer-react`: `src/view-tools.ts`, `src/index.ts`, the tests, and the README (the export `sendInput`).
- Documents: `nodejs/wishem/docs/architecture/` (README, `render.mjs`, and the SVG files of the component diagram of the page), `glossary.md`, `concepts.md`, and the new `nodejs/wishem/docs/milestones/a4-workbench/page-driver.mjs`.
- The changeset.
- No change to `core`, `hub`, `host-nodejs`, `construct-manager`, `sample-product`, the link protocol, or the `wishem` command.
