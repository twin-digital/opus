---
issue: https://github.com/twin-digital/opus/issues/496
milestone: https://github.com/twin-digital/opus/milestone/1
---

# Proposal

## Why

The workbench of Wishem has no user interface and no design system. [First workbench UI slice](https://github.com/twin-digital/opus/issues/477) adds the first user interface, and that slice has large technical problems of its own. This change makes the foundation of the design system first, so that the slice starts with a page that has the correct look and a test setup that is known to work.

An agent builds most of the user interface of Wishem. An agent that has a complete set of tokens and a style guide takes from them and does not invent a style.

## What Changes

- Add a private package, `nodejs/wishem/workbench-app` (`@thrashplay/wishem-workbench-app`). It is the presentation side of the workbench. It uses Vite, React, and Tailwind 4. `nodejs/wishem/workbench` stays the model side and does not change.
- Add the design tokens of the workbench, for light mode and for dark mode: a palette, color roles, text sizes, typefaces, radius, and shadow.
- Bundle the three typefaces in the package: Bricolage Grotesque, Inter, and JetBrains Mono.
- Add two components as plain React components: the app bar and the zero state.
- Add the style guide page. It is a separate page with its own entry. It shows the principles, the tokens, the typography, and each component in each state, in each theme. The build of the workbench page does not include it.
- Add screenshot tests and accessibility tests for the style guide. The web browser of the tests runs in a pinned Playwright container image.
- Add a job to the pull request checks that runs these tests.
- Update the brand files: Moonlight as a sixth color, Inter in the place of Instrument Sans, the new type sizes, and the new Wishfire value for text on a light surface.
- Keep `nodejs/wishem/docs/design-system/style-guide-preview.html`. It is the reference for the look in this change and in [Workbench components](https://github.com/twin-digital/opus/issues/497).

Not in this change:

- The workbench page, the HTML renderer, and each connection to a core. [First workbench UI slice](https://github.com/twin-digital/opus/issues/477) makes them.
- The other components of the catalog: panel, field, button, text input, text area, select, checkbox, prompt box, quote, spirit aside, maker line, callout, badge, and divider. [Workbench components](https://github.com/twin-digital/opus/issues/497) makes them. This change makes each token that they use.
- A control to change the theme. The workbench follows the color scheme of the system.

## Capabilities

### New Capabilities

- `wishem/design-system/component-catalog`: the design tokens, the typography, the components of the workbench with their required states, the two themes, the contrast rules, and the content of the style guide.
- `wishem/design-system/visual-tests`: the screenshot tests and the accessibility tests of the style guide, the pinned web browser that makes the result the same on each computer, and the job of the pull request checks.

### Modified Capabilities

None.

## Impact

- New package: `@thrashplay/wishem-workbench-app` (private).
- New dependencies: React, Tailwind 4, the Vite plugins for them, three `@fontsource` packages, `@playwright/test`, and `@axe-core/playwright`.
- `.github/workflows/ci.yaml`: one new job. The job starts a container from an image of `mcr.microsoft.com`.
- `renovate.json`: a rule that does not merge an update of Playwright automatically.
- `nodejs/wishem/docs/brand.md`, `nodejs/wishem/docs/brand/brand-basics.html`, and the brand images: new colors, typeface, and type sizes.
- `nodejs/wishem/CLAUDE.md` and `nodejs/wishem/docs/README.md`: the new package and the style guide.
- `README.md` of the repository: the generated package list gets the new package.
- A person who runs the tests on a development computer needs Docker.
