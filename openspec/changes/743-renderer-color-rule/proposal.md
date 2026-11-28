---
issue: https://github.com/twin-digital/opus/issues/743
milestone: https://github.com/twin-digital/opus/milestone/19
---

# Proposal

## Why

The React page, the PixiJS page, and the Godot application draw the same sample construct. When the color of the sample entity has no value, or has a value that is not `#rrggbb`, the three renderers draw three different pictures (the table of #743). No specification says what "a color" is for the views of the sample construct, and the three specifications of the views disagree. A person who edits `sample-product/model/state.json`, or who tests a label that gives an empty name (#663), cannot tell which picture is correct.

## What Changes

- One rule for the color of the sample construct: a value of the field `color` is a color when it is text of the form `#rrggbb` (`#` and six hexadecimal digits, in upper case or lower case). Each other value is not a color. A component with no value for the field, and a field whose label gives an empty name (no prop), is "no value".
- One fallback picture: for no value and for a value that is not a color, the `ClearColor` view of each renderer fills the full viewport with the fallback color `#ff00ff`. The view is never hidden.
- The sample product gets one table of color cases, `COLOR_CASES`, with the fallback color `FALLBACK_COLOR`, in the subpath export `@thrashplay/wishem-sample-product/color-cases`. Each case is a value and the color that a view draws for it.
- The `ClearColor` view of the React page (`three-renderers`), of the PixiJS page (`pixi-page`), and of the Godot application (`renderer-godot`) each apply the rule. The unit tests of each view check each case of the table. The GDScript tests read a JSON copy of the table, and a TypeScript test proves that the copy is equal to the table.
- The test from end to end of `three-renderers` gets steps that set the color through the link to a value that is not a color, remove the value, and give the field a label with an empty name. After each step, each pixel of each of the three pictures is `#ff00ff`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wishem/renderers/sample-construct`: a new requirement gives the rule for the color and the fallback color, for the three renderers of the sample construct.
- `wishem/renderers/end-to-end-test`: each picture has the color that the rule gives for the state, and new steps check the fallback color in the three pictures.
- `wishem/renderer-html/react-page`: the `ClearColor` React view fills the box with the fallback color for no value and for a value that is not a color.
- `wishem/renderer-pixi/page`: the `ClearColor` PixiJS view fills the viewport with the fallback color, and does not hide its display object.
- `wishem/renderer-godot/renderer`: the `ClearColor` Godot view fills the viewport with the fallback color, and does not hide its node.

## Impact

- Code: `three-renderers/src/views/ClearColor.tsx`, `pixi-page/src/views/ClearColor.ts`, `renderer-godot/godot/views/ClearColor.gd`, and their tests; the new file `sample-product/src/color-cases.ts`; the new fixture `renderer-godot/godot/tests/fixtures/color-cases.json`; `three-renderers/tests/three-renderers.guide.ui.test.ts`.
- Documents: the READMEs of `sample-product`, `three-renderers`, `pixi-page`, and `renderer-godot`; the row of `sample-product` in the package table of the architecture document (the package view comes from `package.json`). No diagram changes.
- Dependencies: none. The three packages already have `sample-product` as a dependency or a development dependency. Only tests import the table.
- No package is published.
