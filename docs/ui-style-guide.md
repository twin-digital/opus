# UI style guides

Every product with a UI documents its look and feel in a **dev-only style guide view inside the app**,
built from the real components. It is the product's design-system reference; the product's
`openspec/specs/<product>/design-system/component-catalog` spec states the rules it must satisfy.

## The view

- **Location:** a `/style-guide` route (or the stack's equivalent page or view), available only in
  development builds (e.g. gated on `import.meta.env.DEV` in Vite apps); never shipped to production.
- **Sections, in order:**
  1. **Tokens:** colour swatches with token names, spacing scale, radius, shadows. Render them from
     the product's token source (e.g. the CSS variables in `index.css`), never hard-coded copies.
  2. **Typography:** the type scale, weights, and font families in use.
  3. **Components:** every component, each shown in all of its states: default, loading, empty,
     error, and disabled where applicable.
- **Themes:** every section renders in light and dark mode if the product supports both.
- **Principles:** layout, density, and tone conventions go as short prose at the top of the view.

## Tests

- **Visual:** Playwright `toHaveScreenshot` captures each section in each theme. Baselines are
  committed; visual changes show up in PRs as image diffs.
- **Accessibility:** `@axe-core/playwright` runs against each section with no violations allowed.
- **Determinism:** bundle fonts locally and run screenshot tests in a pinned browser image so
  local and CI baselines match.

## Rules for UI code

- Use design tokens and semantic classes (e.g. `bg-primary`, `text-muted-foreground`), never raw
  colours or hex values. Adding a token means adding it to the style guide.
- Reuse existing components before creating new ones; a new component appears in the style guide
  in every state when it lands.
