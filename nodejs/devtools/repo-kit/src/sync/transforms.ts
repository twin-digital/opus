/**
 * A small, curated set of named transforms that sync actions can apply to a derived array of strings. Intentionally a
 * fixed set — not arbitrary user-supplied regex in config — so configuration stays declarative and each transform is
 * unit-tested here, in one place, rather than relying on a hand-rolled pattern per use site.
 *
 * Transforms operate on the whole array (not per element), so future additions can reorder, de-duplicate, or filter —
 * not only map. The config reference is a bare name today; if a transform later needs parameters it can grow to
 * `{ name, options }` without disturbing this array-in / array-out contract.
 */
export const transforms = {
  /**
   * Reduces each pnpm dependency selector to its bare package name by dropping a trailing `@<version>`. Scope-aware:
   * the leading `@` of a scoped name is preserved — only a version separator is removed.
   *
   *   ink                              -> ink
   *   lodash-es@4.17.21                -> lodash-es
   *   '@mishieck/ink-titled-box@0.3.0' -> @mishieck/ink-titled-box
   *   '@scope/name'                    -> @scope/name   (no version present)
   */
  'strip-package-version': (items: readonly string[]): string[] =>
    items.map((item) => item.replace(/(?!^)@[^@/]+$/u, '')),
} satisfies Record<string, (items: readonly string[]) => string[]>

/**
 * Name of a curated transform in {@link transforms}.
 */
export type TransformName = keyof typeof transforms
