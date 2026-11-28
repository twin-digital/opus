# Test guide: milestone W1 "Workbench components"

This guide is the test plan of the milestone W1. It lists each new feature. It shows each feature in steps that one person does alone.

The milestone W1 delivered fifteen React components for the workbench, one token role, and the style guide specimens of the components. It has these features:

1. The style guide and its component groups.
2. The button: four variants, loading, disabled, and the keyboard.
3. The controls: text input, text area, checkbox, and field.
4. The select, and its keyboard use.
5. The prompt box.
6. The content components: panel, quote, spirit aside, maker line, spirit line, callout, badge, and divider.
7. Light mode and dark mode, and the token role `on-fill`.
8. A narrow width.
9. The buttons of the workbench panels: the run bar and the field row.
10. The tests of the package.

## How to read this guide

- A step has a command or an action. After it, the guide gives the result that you see.
- The writer of this guide did each step on the branch `worktree-w1-close-out` (at `main` commit `4fa4a53d`). The writer copied the results from the real output.
- The writer cannot open a web browser. A Playwright script did each step of a page in the pinned Chromium of the package `workbench-app` (a Playwright image, in Docker). The script clicks, types, and presses keys in the page, and prints the state of the page as text. A person does the same actions with the mouse and the keyboard, and sees the same values.
- The writer used the default port 5173 (the page) and 4747 (the link).
- A color in a result is the computed `rgb(...)` value of the browser.
- The style guide shows each section two times: first in a light scope, then in a dark scope. A step that tells you to look at "the light scope" uses the first one. The `Components` section has the scope names `components-light` and `components-dark`.
- Run each command from the root of the repository, unless the guide says other.

## What you need

- A Linux or macOS computer with Node.js 24 and pnpm 11. The file `.nvmrc` of the repository gives the version of Node.js.
- A new checkout of the repository.
- A web browser, for the actions on the pages.
- Docker, local or remote through `DOCKER_HOST`, only for the screenshot and accessibility tests (section 10). A person who only looks at the pages does not need it.

### Install and build

```sh
pnpm install --frozen-lockfile
pnpm build --filter "@thrashplay/wishem-*"
```

Result: the build ends with `Tasks:    19 successful, 19 total`. It took 5 seconds for the writer, with a warm cache. A build with an empty cache takes longer.

### Start the pages

Terminal 1. This command starts the workbench with the sample product. The same server gives the style guide.

```sh
cp -r nodejs/wishem/sample-product/model /tmp/w1-product
pnpm --filter @thrashplay/wishem-workbench-app start --product /tmp/w1-product --product-code @thrashplay/wishem-sample-product --product-views nodejs/wishem/sample-product/views/react
```

Result:

```text
wishem: model /.../nodejs/wishem/workbench/model
wishem: product /tmp/w1-product
wishem: product code @thrashplay/wishem-sample-product
wishem: product views /.../nodejs/wishem/sample-product/views/react
wishem: link at ws://127.0.0.1:4747/link
wishem: workbench at http://127.0.0.1:5173/
```

- The workbench is at `http://127.0.0.1:5173/`.
- The style guide is at `http://127.0.0.1:5173/style-guide.html`.
- A person who needs only the style guide can run `pnpm --filter @thrashplay/wishem-workbench-app dev`. The server prints `Local:   http://localhost:5173/`, and the style guide is at the path `/style-guide.html`. The command `pnpm --filter @thrashplay/wishem-workbench-app style-guide` does the same and opens that path in a browser.
- Press Ctrl+C in terminal 1 to stop the server. Start only one of the two servers at one time, because both use port 5173.

Keep the workbench running for the sections 1 to 9.

## 1. Open the style guide and find each component group

1. Open `http://127.0.0.1:5173/style-guide.html`.

   Result: the tab title is `Wishem workbench style guide`. The page has the heading `Wishem workbench style guide` and the line "Each section shows in light mode and in dark mode."

2. Read the headings of level 2.

   Result: the sections, in order, are `Principles`, `Tokens`, `Typography`, and `Components`. Each section has a light scope and a dark scope. The `Principles` text says: "On a bright fill, text is always ink."

3. Look in the `Tokens` section for the role `on-fill`.

   Result: the swatch list has `on-fill`. Its value is `#17172a` (the color `ink`) in the light scope and in the dark scope.

4. Scroll the `Components` section in the light scope.

   Result: the groups follow in this order. Each group is a grid of states or a set of named regions:

   - App bar and zero state (regions `App bar`, `App bar, long title`, `App bar, edit`, `App bar, saving`, `App bar, not saved`, and `Zero state`). These are components of an earlier milestone.
   - Buttons: a grid with the rows `maker`, `neutral`, `quiet`, and `danger`, and the columns `Default`, `Hover`, `Active`, `Focus`, `Disabled`, and `Loading`.
   - Controls: a grid for `Text input`, `Empty input`, and `Text area` (columns `Default`, `Hover`, `Focus`, `Error`, `Disabled`, `Read-only`), the region `Error with focus`, a grid for the checkbox (`Checkbox, off` and `Checkbox, on`; columns `Default`, `Hover`, `Focus`, `Disabled`), and the region `Checkbox, long label`.
   - Selects: a grid with the columns `Default`, `Hover`, `Focus`, `Error`, `Disabled`, and the regions `Select, open`, `Select, value not in options`, `Select, no options`, and `Select, narrow`.
   - Prompt boxes: the regions `Prompt box, empty`, `Prompt box, focus with text`, `Prompt box, working`, `Prompt box, disabled`, and `Prompt box, narrow`.
   - Panels: the regions `Panel with a header and a footer`, `Panel, plain`, `Panel, body only`, and `Maker line and spirit line in a panel`.
   - Content: the regions `Spirit aside`, `Quote with a source`, `Callouts`, `Badges`, and `Dividers`.
   - Narrow: the regions `Panel, narrow` and `Callout, narrow`.
   - Product panel specimens: the entity list, the field rows, the inspector, and the product panel.
   - Run controls: the regions `Button`, `Button, maker`, `Button, disabled`, the run bar in eight states, and the stage frame.

   The page has 71 named regions in each scope.

## 2. The button

The steps use the `Buttons` grid in the light scope.

1. Look at the four rows in the `Default` column.

   Result: the `maker` button (label `Apply`) has an amber fill (`rgb(242, 169, 59)`) and dark text (`rgb(23, 23, 42)`). The `neutral` button (`Cancel`) has a white fill, a border of `rgb(133, 133, 154)`, and dark text. The `quiet` button (`Reset`) has no fill and no border, and gray text (`rgb(91, 91, 112)`). The `danger` button (`Delete`) has a red fill (`rgb(232, 85, 90)`) and dark text (`rgb(23, 23, 42)`).

2. Look at the columns `Hover`, `Active`, and `Focus`.

   Result: the style guide forces these states, so they show with no pointer. The hover state of the `maker` and `danger` buttons is brighter. The active state is darker and one pixel lower. The `neutral` and `quiet` buttons get a gray fill in the hover and active states. The focus state has an outline of two pixels in the maker color.

3. Look at the `Disabled` column.

   Result: each button is dimmed (opacity `0.45`). The cursor on it is `not-allowed`. Each one has the native attribute `disabled`.

4. Look at the `Loading` column.

   Result: each button shows a small spinner before its label. Its opacity is `1`. The cursor on it is `progress`. It has `aria-busy="true"` and no `disabled` attribute.

5. Keyboard. Click the `maker` button in the `Default` column to place the focus, or press Tab until it has the focus. Press Tab eight times and note each focus.

   Result: the focus goes to the `Apply` buttons of the `Hover`, `Active`, and `Focus` columns, then to the `Apply` button of the `Loading` column, then to the `Cancel` button of the `Default` column, and on through `Hover`, `Active`, and `Focus`. The focus never goes to a disabled button. The `Disabled` column has no tab stop.

6. Click the `neutral` button of the `Disabled` column.

   Result: nothing happens, and no element takes the focus.

7. Press Tab until the `neutral` button of the `Loading` column has the focus, and press Enter.

   Result: the loading button holds the focus (it stays in the tab order), and Enter does nothing.

8. Find the region `Button, disabled` near the end of the `Components` section.

   Result: the button `Step` in it has the native attribute `disabled`.

## 3. The controls: text input, text area, checkbox, and field

The steps use the grid `Controls` in the light scope.

1. Click in the text input of the row `Text input`, column `Default` (it holds `Cave bat`). Press End, and type ` II`.

   Result: the value is `Cave bat II`. While the input has the focus, its border is `rgb(158, 91, 12)` and it has an inset ring of one pixel in the same color.

2. Look at the `Disabled` column of the row `Text input`.

   Result: the input is disabled. It does not take the focus.

3. In the `Read-only` column, click the input and type `zz`.

   Result: the input takes the focus, and the value stays `Cave bat`. The text input and the text area have a `Read-only` cell. The row `Empty input` has none.

4. Look at the `Error` column.

   Result: the cell shows the label `Speed`, the input with the value `fast`, and the message `Enter a number.` in the danger color. The input has `aria-invalid="true"`. The message is its accessible description, and the label `Speed` is its accessible name.

5. Click in the text area of the row `Text area`, column `Default`. Press Ctrl+End, press Enter, and type `Second line`.

   Result: the area has two rows. Its value is `Flees when a torch is lit.` then a new line, then `Second line`. Enter makes a new line in the text area.

6. In the grid of the checkbox, look at the row `Checkbox, off` and the row `Checkbox, on`.

   Result: the box in the row `on` has an amber fill and a check mark. The box in the row `off` is empty. The label is `Flees light`.

7. Press Tab until the `Checkbox, off` box in the `Default` column has the focus, and press Space.

   Result: the box stays unchecked. The checkbox holds no state. It reports the other value to its caller, and the style guide specimen has a caller that ignores it.

8. Click the label text `Flees light` of the same cell.

   Result: the box takes the focus. The box stays unchecked, for the same reason.

9. Look at the `Disabled` column of the checkbox grid.

   Result: the box is disabled and dimmed.

## 4. The select

The steps use the `Select` grid in the light scope. Its specimens hold the value `Enemy`, and they ignore a new value. The options are `Enemy`, `Prop`, `Pickup`, and `Boss (not available)`. The option `Boss (not available)` is disabled.

1. Click the select in the `Default` column.

   Result: the trigger has `aria-expanded="true"`, and a menu opens below it. The trigger has the role `combobox`. The page also shows the menus of the specimens that stay open (`Select, open` and the other three).

2. Click the disabled option `Boss (not available)` of the open menu.

   Result: the option has `aria-disabled="true"` and opacity `0.6`. The click does nothing, and the menu stays open.

3. Click the option `Prop`.

   Result: the menu closes. The trigger still shows `Enemy`, because the specimen ignores the new value.

4. Keyboard. Press Tab until the trigger in the `Default` column has the focus (its name is `Kind`). Press ArrowDown.

   Result: the menu opens (`aria-expanded="true"`), and the focus goes to the selected option `Enemy`.

5. Press ArrowDown three times.

   Result: the focus goes to `Prop`, then to `Pickup`, then to `Boss (not available)`. The disabled option can take the focus, and a person cannot select it.

6. Press Escape.

   Result: the menu closes (`aria-expanded="false"`). The focus goes back to the trigger `Kind`.

7. Press Enter to open the menu. Type `pi`.

   Result: the focus goes to the option `Pickup`. Press Escape to close the menu.

8. Look at the `Error` column and the `Disabled` column.

   Result: the `Error` cell shows the label `Kind`, the select, and the message `Select a kind.`. The trigger has `aria-invalid="true"`. The trigger of the `Disabled` cell is disabled.

9. Look at the regions `Select, value not in options` and `Select, no options`.

   Result: the first menu shows a value (`goat`) that is not in its options, as text. The second menu has no option and shows the placeholder text `Select a kind`.

## 5. The prompt box

The steps use the regions `Prompt box, ...` in the light scope.

1. Look at the region `Prompt box, empty`.

   Result: the box has an empty text area with the placeholder `Describe a game, a level or a single mechanic.`, the hint line `Enter to send · Shift+Enter for a new line`, and the amber button `Make a wish`. The button is disabled.

2. Click in the text area and type `make the bats flee`.

   Result: the button `Make a wish` is enabled.

3. Press Shift+Enter and type `and glow`.

   Result: the value has two lines: `make the bats flee` and `and glow`.

4. Press Tab.

   Result: the focus goes from the text area to the button `Make a wish`.

5. Click in the text area, and press Enter.

   Result: the box calls its `onSend` (the style guide specimen does nothing with it). The text stays in the area and the button stays enabled.

6. Look at the region `Prompt box, working`.

   Result: the hint line shows the spinner and the text `Wishem is working`. The button is `Stop`. The text area is read-only and has `tabindex="-1"`.

7. Look at the region `Prompt box, disabled`.

   Result: the hint line shows `Not connected`. The text area is disabled and the button `Make a wish` is disabled.

8. Press Tab until the button `Stop` of the working box has the focus. Press Tab three times.

   Result: the focus goes to the text area of `Prompt box, narrow`, then to the `Name` text input of the `Panel with a header and a footer`, and then to its select `Enemy`. The disabled box gets no tab stop. Tab does not reach `Make a wish` of the disabled box.

## 6. The content components

The steps use the light scope of the `Components` section.

1. Look at the region `Panel with a header and a footer`.

   Result: the text is `Cave bat`, the badge `DRAFT`, the fields `Name`, `Kind` (a select with `Enemy`), and `Speed` (with the message `Enter a number.`), the checkbox `Flees light`, and in the footer the buttons `Reset` and `Apply`.

2. Look at the regions `Panel, plain` and `Panel, body only`.

   Result: the plain panel has a title and a body. The other panel has only a body.

3. Look at the region `Maker line and spirit line in a panel`.

   Result: the panel `Replay` shows the maker line `> make the bats flee when the torch is lit`, and a spirit line `Done. Bats now scatter when a torch is lit.`

4. Look at the region `Spirit aside`.

   Result: the text is `Wishem: This is my favourite trick. A torch makes the bats scatter.`

5. Look at the region `Quote with a source`.

   Result: the quote is `A kit is what the first game leaves behind.` and the source is `rules.md, R7`. The quote is a `blockquote` with a `cite` element.

6. Look at the region `Callouts`.

   Result: four callouts follow, with these titles and texts: `Done.` (The kit passed each run.), `Check this.` (Two runs got stuck in room 3.), `Failed.` (The bat has no kind.), and `Note.` (A run takes about a minute.). The variants are `success`, `warning`, `danger`, and `info`. A callout has no ARIA `role` attribute.

7. Look at the region `Badges`.

   Result: eight badges show in capital letters: `NEUTRAL`, `MAKER`, `SPIRIT`, `ACCENT`, `PASSED`, `STUCK`, `FAILED`, and `INFO`.

8. Look at the region `Dividers`.

   Result: two dividers (`hr` elements). The first is plain. The second is the accent divider.

## 7. Light mode and dark mode

1. In the style guide, compare the light scope and the dark scope of the `Components` section.

   Result: the light scope has the ground `rgb(247, 247, 250)` and the text `rgb(28, 28, 46)`. The dark scope has the ground `rgb(18, 18, 34)` and the text `rgb(236, 236, 243)`.

2. Compare the `maker` button and the `danger` button in the two scopes.

   Result: they have the same colors in both scopes. The `maker` fill is `rgb(242, 169, 59)` and the `danger` fill is `rgb(232, 85, 90)`. Their text is `rgb(23, 23, 42)` (the role `on-fill`, the value `#17172a`) in both scopes.

3. Set the color scheme of the operating system, or of the browser, to dark. Open `http://127.0.0.1:5173/` with the sample product.

   Result: the first painted surface has the color `rgb(18, 18, 34)` (dark). With the scheme light, it has `rgb(247, 247, 250)`. The workbench follows the scheme of the operating system. The style guide shows both schemes at the same time.

## 8. A narrow width

1. In the light scope, look at the regions `Prompt box, narrow`, `Panel, narrow`, `Callout, narrow`, `Checkbox, long label`, and `Select, narrow`.

   Result: each of them is in a box 260 pixels wide. None of them is wider than its box. A long panel title is cut, the footer of the panel wraps, the long word of the callout breaks inside its box, and the long label of the checkbox wraps.

2. Make the browser window 375 pixels wide. Reload the style guide.

   Result: the page has no horizontal scroll bar (`scrollWidth` is 375).

3. With the window 375 pixels wide, open `http://127.0.0.1:5173/` and select the entity `Counter, Color`.

   Result: the page has no horizontal scroll bar. The run bar is 343 pixels wide. Its four buttons end at 311 pixels. The button `Clear count` is 61 pixels wide.

## 9. The buttons of the workbench panels

The run bar and the field row of the workbench use the new button. They use `focusableWhenDisabled`: a disabled button keeps the focus and its place in the tab order, and it has `aria-disabled="true"` and no native `disabled` attribute.

The steps use `http://127.0.0.1:5173/`.

1. Open the page.

   Result: the run bar (role `toolbar`, name `Product controls`) has the buttons `Run`, `Pause`, `Step`, and `Step back`. `Run` has the amber fill with dark text. The three other buttons have `aria-disabled="true"`, opacity `0.45`, a border of `rgb(133, 133, 154)`, and the cursor `not-allowed`.

2. Look at the tab stops of the run bar.

   Result: `Run` has `tabindex=0`. The three other buttons have `tabindex=-1`. The run bar has one tab stop.

3. Press Tab to put the focus on `Run`, and press Tab again.

   Result: the focus leaves the run bar. No other control of the page takes the focus when no entity is selected.

4. Put the focus on `Run` and press ArrowRight.

   Result: the focus stays on `Run`. The other buttons are disabled, so the arrow keys skip them.

5. Click the disabled `Pause` button.

   Result: nothing happens. The status does not change.

6. Click `Run`.

   Result: the status shows `RUNNING`. The buttons are `Stop` (enabled, `tabindex=0`), `Pause` (enabled, `tabindex=-1`), `Step` (disabled), and `Step back` (disabled). The first button shows `Stop` and not `Run` while the product runs.

7. Click `Pause`.

   Result: the buttons are `Stop`, `Resume`, `Step`, and `Step back`, all enabled. `Stop` has `tabindex=0`. The three others have `tabindex=-1`.

8. Put the focus on `Resume`. Press ArrowRight three times, then End, then Home.

   Result: the focus goes to `Step`, then `Step back`, then wraps to `Stop`. End moves the focus to `Step back`. Home moves it to `Stop`.

9. Press Tab, then Shift+Tab.

   Result: Tab leaves the run bar. Shift+Tab puts the focus back on `Stop`, the button with the tab stop.

10. Click `Stop`.

    Result: the buttons are `Run` (enabled, `tabindex=0`) and the three disabled buttons.

11. In the list `Entities`, click `Counter, Color`. Look at the row `count`.

    Result: the row has the text input with the value of the field, and the button `Clear`. The button has the accessible name `Clear count` and the neutral look (a border of `rgb(133, 133, 154)`).

12. Type `7` in the input of `count`, and press Enter.

    Result: the value is saved. The button `Clear count` is enabled.

13. Put the focus in the input, and press Tab.

    Result: the focus goes to the button `Clear count`.

14. Press Enter on `Clear count` (or click it).

    Result: the input is empty, and the row shows `NO VALUE`. The button `Clear count` has `aria-disabled="true"` and opacity `0.45`. It keeps the focus.

15. Press Shift+Tab, then put the focus on `Clear count` again, and press Enter.

    Result: Shift+Tab puts the focus in the input. The disabled button takes the focus again, and Enter does nothing.

16. A field of the type reference list has the buttons `Remove <name>` and `Add`. They use the same `focusableWhenDisabled`. The sample product has no field of this type, so the workbench steps do not show them.

    Result: the specimens `Field row, reference list` and `Field row, reference list, empty` of the style guide show these buttons.

## 10. The tests of the package

The package has unit tests and Playwright tests.

1. Unit tests:

   ```sh
   pnpm --filter @thrashplay/wishem-workbench-app test
   ```

   Result: `Test Files  49 passed (49)` and `Tests  866 passed (866)`. It took 25 seconds for the writer.

2. The screenshot, accessibility, contrast, and behavior tests of the style guide. They need Docker.

   ```sh
   pnpm --filter @thrashplay/wishem-workbench-app test:ui tests/style-guide.spec.ts
   ```

   Result: the line `138 passed (1.6m)`. The command starts the pinned browser image, builds the style guide, and removes the container at the end. The command without a file name runs all Playwright projects of the package. It takes longer than three minutes.

   The tests cover the screenshot of each section in each theme, the screenshot of each state of each component, the axe check of each section, the contrast of each state from the token values, and the narrow specimens.

## Observed faults

The writer did each step and found no step that fails to give its result. The writer created no issue of the type `Bug`.

Two observations are not faults:

- The style guide specimens of the select and the checkbox ignore a new value. The component holds no value, and the specimen gives it a fixed one.
- The status of a product construct that ran and stopped shows `STOPPED`, and not `NOT RUNNING`. The status `NOT RUNNING` shows before the first run.

## What the milestone did not build

- The panels of `main` still use native controls: the input and the select of the field row, the select of the reference list, and the input of the app bar title. Issue #822 moves them onto the catalog components.
- The focus ring of the field row and the outline of the catalog contradict each other. Issue #822 removes the contradiction.
- The catalog has no menu, dialog, tooltip, tab list, table, or toast. The milestone built only the fifteen components of the list above.
- The select has no search field, no multiple choice, and no groups of options.
- The checkbox, the select, and the text controls hold no value. The caller holds the value.
- The callout has no ARIA `role`.
- No theme switch exists in the workbench. The workbench follows the color scheme of the operating system.
