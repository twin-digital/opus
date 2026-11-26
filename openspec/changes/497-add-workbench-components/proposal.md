---
issue: https://github.com/twin-digital/opus/issues/497
milestone: https://github.com/twin-digital/opus/milestone/1
---

# Proposal

## Why

The workbench has two components: the app bar and the zero state. [Workbench panels](https://github.com/twin-digital/opus/issues/478) and each later tool need controls and content components. An agent builds most of the user interface of Wishem. An agent that finds each control in the style guide takes it from there and does not invent a style.

The look of each component and each state is settled. The record is [Workbench components](https://github.com/twin-digital/opus/issues/497), with the answers to its twelve questions, and `nodejs/wishem/docs/design-system/style-guide-preview.html`.

## What Changes

- Add fifteen components to `nodejs/wishem/workbench-app`, as plain React components that need no core: panel, field, button, text input, text area, select, checkbox, prompt box, quote, spirit aside, maker line, spirit line, callout, badge, and divider. The field and the controls work together, so that a control in a field gets its label and its error message.
- Add one role to the tokens: `on-fill`, for text and marks on a bright fill. Its value is `ink` in each theme. The contrast rule for a fill uses `on-fill` in the place of `ink`.
- Add one dependency to the package: Base UI (`@base-ui/react`), for the keyboard behavior, the screen reader roles, and the menu position of the select.
- Show each component in the components section of the style guide, in each state, in light mode and in dark mode. The hover, active, and focus states can be forced with an attribute, so the section is a static grid of states.
- Show a narrow specimen, in a box of 260 pixels, for the panel with a form, the prompt box, and the select with a long value.
- Add tests: for each control, a test that the real hover and focus states have the same style as the forced specimen; and a test that calculates the contrast of each state that a person uses, from the token values.
- Update the screenshot baselines of the tokens section and the components section.

Not in this change:

- The app bar and the zero state. They exist.
- App menu, tabs, dialog, tooltip, and table. They are deferred.
- The property list, the list, and the list row. [Workbench panels](https://github.com/twin-digital/opus/issues/478) makes the list and the list row.
- A text control that connects to the model. [Tools](https://github.com/twin-digital/opus/issues/484) decides it. Until then, a view holds no text input and no text area.
- Rich text in a field value.
- A use of a new component in the workbench page or in a view.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/design-system/component-catalog`: the role `on-fill` and the changed contrast rule; the rules for the props of a component; the look, the states, and the behavior of each new component; the two focus looks; the contrast of the dimmed states; the behavior in a narrow container; and the forced states of the style guide.
- `wishem/design-system/visual-tests`: a test that proves that the real state of a control has the same style as its forced specimen.

## Impact

- `@thrashplay/wishem-workbench-app` (private): new components in `src/components/`, new token, new style guide specimens, new tests, new baselines.
- New dependency: `@base-ui/react`.
- `nodejs/wishem/workbench-app/README.md`: the list of components, the force attribute, and the rules for props.
- `nodejs/wishem/docs/README.md`: the description of the preview and of the style guide.
- No change to the workbench page, the renderer, a view, a model, or a different package.
- No change at the C4 context level or the container level.
