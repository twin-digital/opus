---
issue: https://github.com/twin-digital/opus/issues/501
milestone: https://github.com/twin-digital/opus/milestone/1
---

# Proposal

## Why

[First workbench UI slice](https://github.com/twin-digital/opus/issues/477) declares each component type in two places: the definition file in the model folder, and the `defineView` call in the view, which repeats the ID of the component type and of each field. A check compares the two on each snapshot. [Workbench panels](https://github.com/twin-digital/opus/issues/478) adds more views, so the way to attach a view to a component type must be settled before that issue starts.

A view is code of the product that a renderer runs, and it has the shape of a behavior: code that is attached to a component type, with the fields of the component as its inputs. This change makes that shape for views first. See [the comment on the new direction](https://github.com/twin-digital/opus/issues/501#issuecomment-7171211504) and [the answers to questions 1 and 9](https://github.com/twin-digital/opus/issues/501#issuecomment-7171388184).

## What Changes

- Add a **sidecar** file beside each view. The sidecar is a JSON file that holds the kind of the view and the ID of its component type. It attaches the view to the component type.
- Add a generator. It writes the types of the props of each view from the component type definition. The name of a prop comes from the label of its field. The generator is a command of `workbench-app`, and the `start` script runs it after each change to a definition or a sidecar.
- Change a view file. Its default export is a function from props to a picture. It imports the types of its props from the generated file. It states no ID.
- Change the HTML renderer. It collects the sidecars, gives each view the fields of its component type by name, and warns about a sidecar whose component type has no definition.
- **BREAKING** Remove `defineView`, the declaration of the props in a view, and the comparison of a view with its definition on each snapshot.
- Change the view of `AppBar` to the new form, with its sidecar and its generated types.
- Update the blueprint: the glossary entries "view" and "React view", the row for "component" as a word for React code in the table of terms that are not used, the text about views in `concepts.md`, and the architecture documents.

Not in this change:

- A definitions API. A person writes a definition as a JSON file in the model folder.
- A prompt for a view, a history of a view, generation of a view by the agent, and an editor for a view in the workbench.
- A new rule for the state after a component type changes. The rule of the `wishem/core/model` specification applies.
- A reference from a field to a different component.
- A type check when a view is saved, and a way for a renderer to report the problems of a view to the core.
- A stored name for a field that code uses, in addition to the ID and the label.
- A change to `@thrashplay/wishem-core`, `@thrashplay/wishem-host-nodejs`, or `@thrashplay/wishem-workbench`.
- A change to the picture of the page. The page shows the same app bar and the same zero state.
- A rename of "component" to "view" in the `wishem/design-system/component-catalog` specification, in `src/components/`, and in [Workbench components](https://github.com/twin-digital/opus/issues/497).

This change builds on [First workbench UI slice](https://github.com/twin-digital/opus/issues/477), which is merged and archived.

This change alters no element and no relationship at the C4 context level or the container level, and no entity of a store of persisted data. Thus it lists no `wishem/architecture/diagrams` capability. See D9 of `design.md`.

## Capabilities

### New Capabilities

- `wishem/renderer-html/view-types`: the generated types of the props of a view: what the generator writes, how a prop gets its name, the command, the check for files that are not current, and how the `start` script keeps the files current.

### Modified Capabilities

- `wishem/renderer-html/views`: a sidecar attaches a view to its component type, a view file exports a function, a view gets each field of its component type by name, and the declaration with `defineView` and the comparison with the definition are removed.

## Impact

- `@thrashplay/wishem-workbench-app` (private): the renderer modules, the `AppBar` view with its sidecar and its generated types, the generator, a `generate` script, the `start` script, the unit tests, and the end-to-end tests.
- `nodejs/wishem/docs/glossary.md` and `concepts.md`: the terms and the rules for views.
- `nodejs/wishem/docs/architecture/`: the text that names `defineView` and `checkViews`, and the diagram "From a file to a picture", through its description in `render.mjs`.
- `nodejs/wishem/workbench-app/README.md` and `nodejs/wishem/CLAUDE.md`: how to add a view.
- `.prettierignore`: the generated files.
- No change to a published package, to the pull request checks, or to `turbo.json`.
