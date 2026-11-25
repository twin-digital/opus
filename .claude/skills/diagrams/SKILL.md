---
name: diagrams
description: Use when you add or change a diagram in permanent documentation (a docs/ folder, web content, a user manual), when an OpenSpec change requires an architecture document or changes one, or when you must make an SVG diagram from design tokens.
---

# Diagrams

## Overview

Make an SVG diagram of high quality for permanent documentation. A script writes each diagram from one description. The author makes an image of each file and looks at it before the work is complete.

[`docs/diagrams.md`](../../../docs/diagrams.md) gives the rules: the form of a diagram, the C4 diagrams of a product, the architecture document, and the quality rules. Read it first.

Each product has its own render script. There is no shared renderer library.

## Steps

1. **Decide the form.** In a temporary context, write a Mermaid diagram and stop. This skill is for permanent documentation only.
2. **Decide the type and the scope.** Select one row of the C4 table or of the entity diagram table in `docs/diagrams.md`. For a store of persisted data, the type is an entity diagram of that store. Write the title: `<type>: <scope>`, for example `Entity diagram: <store>`.
3. **Read the code.** Find each element and each relationship in the code. Record the direction of each relationship: which element calls, sends, reads, or writes. For an entity diagram, read the schema of the store: each entity, its keys, and the cardinality of each relationship.
4. **Write one description of the diagram.** The description is data in the render script: the title, the `desc` text, the size, and a list of items (boundaries, elements, relationships, legend). Each element has its name, its type and technology, and one short line of description. Each relationship has one short label.
5. **Write or extend the render script.** See "The render script".
6. **Run the script.** Run it two times. Make sure that the second run changes no file (`git status`).
7. **Check the files.** Run `node .claude/skills/diagrams/scripts/check-svg.mjs <files>`. Give each light file and its dark file in one run, so that the script compares their text.
8. **Make an image of each file and look at it.** See "Look at each image". Fix each problem in the description, then go back to step 6.
9. **Write the document.** Put each diagram in a `picture` element. Write the prose and the table of the elements. See "The document".
10. **Name the diagram in the specification.** Add or change the requirement in `<product>/architecture/diagrams`. In an OpenSpec change, do this in the delta spec of the change. The form is in `docs/diagrams.md`.
11. **Show the owner.** Give the owner the images of the light file and the dark file, and the path of each file. Do not call the work complete before the owner accepts the diagram.

## The render script

The script is `render.mjs` in the folder of the architecture document. For a different diagram, put it next to the SVG files.

- **Runtime.** Node.js ESM. Use only `node:` modules. Do not use a browser. Do not add a dependency.
- **Command.** `node <folder>/render.mjs` writes each SVG file of the folder.
- **One description, two themes.** Each diagram is described one time. The script writes `<diagram>-light.svg` and `<diagram>-dark.svg` from the same description. Only the colors change between the two files.
- **Colors.** Read the colors from the token file of the product (for example a CSS file of custom properties). Resolve `var()` and `light-dark()` to one color for each theme. Fail when a token is not in the file. Derive tints by mixing two token colors. If the product has no token file, define the colors one time at the top of the script, as named roles.
- **Fonts.** Use a system font stack, for example `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Do not embed font data. Do not reference a font file.
- **One text function.** Draw all text through one function. It escapes XML, and it checks the fit (see "The checks of the script").
- **Accessibility.** Each SVG file has `role="img"`, a `title`, and a `desc`, and `aria-labelledby` names the two. The `desc` gives the content of the diagram in two to four sentences.
- **Definitions.** Write the same `defs` in each theme. Each `url(#id)` must have its definition in the same file.
- **Determinism.** Round each number to two decimals. Do not use the time or a random value. Sort each list that comes from the file system.
- **Layers.** Draw the boundaries first, then the elements, then the relationships, then the legend.

### The checks of the script

The script fails (throws an error and writes no file) when one of these checks fails:

- **Label fit.** Estimate the width of each line of text as `characters × font size × factor`. Use a conservative factor for a wide system font: about `0.6` for regular text, `0.62` for bold text, and `0.7` for uppercase text. Fail when a line is wider than the space for it.
- **Arrow length.** Measure the visible line of each arrow. Fail when an arrow without a label is shorter than `MIN_PLAIN` (start at 56 px). For an arrow with a label chip, fail when the line on either side of the chip is shorter than `MIN_SIDE` (start at 28 px).
- **Label position.** Fail when the point of a label chip is not on the line of its arrow.
- **Tokens.** Fail when a token is not in the token file, or does not resolve to a plain color.

## Look at each image

Make a PNG image of each SVG file at the width of the page where it shows. Use the page color of each theme as the background. For a Markdown file on GitHub, use a width of about 880 px.

```
node .claude/skills/diagrams/scripts/rasterize.mjs --width 880 --background '#ffffff' --out <scratch dir> <name>-light.svg
node .claude/skills/diagrams/scripts/rasterize.mjs --width 880 --background '#0d1117' --out <scratch dir> <name>-dark.svg
```

`rasterize.mjs` runs Chromium in the Playwright Docker image, with the version of the `@playwright/test` catalog entry. It needs Docker. Use `--scale 2` to see small details.

Open each image and look at it. Check each item of this list:

- [ ] The title gives the C4 type and the scope.
- [ ] The legend is present, and it explains each shape, color, and line style.
- [ ] Each element shows its name, its type and technology, and one short line of description. No text is cut or overlaps a border.
- [ ] No text is a sentence beyond the one-line description of an element.
- [ ] The direction of each arrow agrees with the code. Check each arrow, one at a time, against step 3.
- [ ] Each arrow has a clear line on each side of its label chip. No arrow crosses a card or a label.
- [ ] One clear path uses the accent color. Other relationships use a quiet neutral color.
- [ ] Elements align on a grid. The spaces between elements are equal where the elements are peers.
- [ ] The dark image has the same content as the light image, and each part is visible on the dark page color. No shadow, filter, or fill is missing.
- [ ] Few text sizes are in use: a title size, a name size, and a detail size.

For an entity diagram, also check each item of this list:

- [ ] Each entity of the store is present.
- [ ] Each entity card shows its name and its keys only. No other field is present.
- [ ] Each relationship has a cardinality mark at each end, and the legend explains each mark.
- [ ] The name of each entity and each key is equal to the name in the schema.

## The document

Put each diagram in a `picture` element. The `source` selects the dark file for a reader in dark mode:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="containers-dark.svg" />
  <img
    alt="Container diagram of the example product: the web app calls the API, and the API reads and writes the database."
    src="containers-light.svg"
  />
</picture>
```

After the diagram, write the prose and the table of the elements, as `docs/diagrams.md` describes. The prose carries the detail that the diagram leaves out. Do not repeat the diagram in words.

## Common mistakes

| Mistake                                    | Fix                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| An arrow points the wrong way              | Check each arrow against the code. A check of the image alone does not find it. |
| The dark file references a filter it lacks | Write the same `defs` in each theme. `check-svg.mjs` finds this.                |
| Paragraphs of text in the diagram          | Keep the C4 text only. Move the detail to the prose.                            |
| A short arrow with a label chip            | Move the elements apart until the script passes the `MIN_SIDE` check.           |
| An embedded web font                       | Use the system font stack. The brand shows in the token colors.                 |
| An SVG file edited by hand                 | Change the description in `render.mjs` and run the script again.                |
