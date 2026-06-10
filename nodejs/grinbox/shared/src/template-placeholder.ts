/**
 * The shared `{{ ... }}` placeholder grammar for the prompt/message/category
 * templates rendered by the built-in Operators. This module owns the single
 * source of truth for the placeholder pattern so that template *rendering* (the
 * server's `renderTemplate`) and template *dependency derivation*
 * (`contractFromConfig`, via {@link extractTemplateTagRefs}) can never drift
 * apart on what counts as a placeholder.
 *
 * ## Syntax
 *
 * A placeholder is `{{ name }}` — surrounding whitespace inside the braces is
 * ignored. The recognized names are Message fields (`from`, `subject`, …) and
 * the `tag.<key>` form, which reads an input Tag value. Only the `tag.<key>`
 * form is a Tag *dependency*: a template that reads `{{tag.urgency}}` depends on
 * whoever produces the `urgency` Tag, exactly as a `when` gate or a Rule's
 * `tag.urgency` reference does.
 */

/**
 * Matches a single `{{ ... }}` placeholder; the inner name is captured in group
 * 1 (with surrounding whitespace trimmed). The pattern is `global`, so callers
 * that reuse the same instance across calls must reset `lastIndex` (or pass it
 * to a fresh `String.prototype.replace`/`matchAll`, which do not depend on it).
 */
export const TEMPLATE_PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g

/** The `tag.<key>` placeholder prefix; the suffix is the referenced Tag key. */
const TAG_PREFIX = 'tag.'

/**
 * Returns the distinct Tag keys referenced as `{{tag.<key>}}` in `template`, in
 * first-seen order. Used by `contractFromConfig` to derive an Operator's input
 * Tag dependencies from its template field(s): a template that reads
 * `{{tag.urgency}}` makes the Operator depend on whoever produces `urgency`.
 *
 * Only the `tag.<key>` form contributes — bare Message-field placeholders
 * (`{{from}}`, `{{subject}}`, …) and any unrecognized name are NOT Tag refs and
 * yield no keys. An empty `tag.` (i.e. `{{tag.}}`) yields no key.
 */
export function extractTemplateTagRefs(template: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const m of template.matchAll(TEMPLATE_PLACEHOLDER)) {
    const name = m[1]
    if (!name.startsWith(TAG_PREFIX)) {
      continue
    }
    const key = name.slice(TAG_PREFIX.length)
    if (key.length === 0 || seen.has(key)) {
      continue
    }
    seen.add(key)
    keys.push(key)
  }
  return keys
}
