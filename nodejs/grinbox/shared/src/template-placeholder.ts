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
 * The bare Message-field placeholder names the renderer resolves. The single
 * source shared by the server's `renderTemplate` (which substitutes these) and
 * save-time template validation (which rejects any other bare name), so the
 * two can never drift on what counts as a known field.
 *
 * `snippet` renders empty where the backend supplies no preview of the Message
 * (d-y3uh9ofx) — it is never derived from the body.
 */
export const TEMPLATE_MESSAGE_FIELDS = ['from', 'to', 'subject', 'snippet', 'body'] as const

const TEMPLATE_MESSAGE_FIELD_SET: ReadonlySet<string> = new Set(TEMPLATE_MESSAGE_FIELDS)

/**
 * Whether `template` contains a `{{body}}` placeholder — i.e. rendering it
 * reads the Message body. Drives the lazy body fetch: an Operator whose
 * template references the body triggers a `mailbox.fetch_body` before its
 * run when the body is not yet cached.
 */
export function templateReferencesBody(template: string): boolean {
  for (const m of template.matchAll(TEMPLATE_PLACEHOLDER)) {
    if (m[1] === 'body') {
      return true
    }
  }
  return false
}

/**
 * Matches a placeholder body in the reserved call form — `name(...)`, e.g.
 * `{{count()}}` or `{{sum(tag.amount)}}`. The form is reserved in the template
 * grammar for future set-level aggregation; no template renders it today, and
 * save-time validation rejects
 * it with a dedicated "reserved for aggregation" error rather than the generic
 * unknown-placeholder one.
 */
const RESERVED_CALL_FORM = /^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/s

/** Whether a placeholder body uses the reserved `name(...)` call form. */
export function isReservedCallPlaceholder(name: string): boolean {
  return RESERVED_CALL_FORM.test(name)
}

/**
 * Returns the distinct placeholder bodies in `template` that use the reserved
 * `name(...)` call form (see {@link isReservedCallPlaceholder}).
 */
export function extractReservedCallPlaceholders(template: string): string[] {
  const reserved: string[] = []
  const seen = new Set<string>()
  for (const m of template.matchAll(TEMPLATE_PLACEHOLDER)) {
    const name = m[1]
    if (!isReservedCallPlaceholder(name) || seen.has(name)) {
      continue
    }
    seen.add(name)
    reserved.push(name)
  }
  return reserved
}

/**
 * Returns the distinct placeholder names in `template` that the renderer would
 * NOT resolve: a bare name outside {@link TEMPLATE_MESSAGE_FIELDS}, or a bare
 * `tag.` with an empty key. `tag.<key>` refs with a non-empty key are known
 * here regardless of whether the key has a producer — that is the Pipeline
 * graph's dangling-input check, not a placeholder-name check. Placeholders in
 * the reserved `name(...)` call form are excluded — they are reported by
 * {@link extractReservedCallPlaceholders} with their own error instead.
 *
 * The renderer substitutes an unknown placeholder with the empty string, so
 * these are silent no-ops at run time; save-time validation uses this to
 * reject them instead (a misspelling like `{{Body}}` is almost certainly a
 * mistake, not an intentional empty string).
 */
export function extractUnknownTemplatePlaceholders(template: string): string[] {
  const unknown: string[] = []
  const seen = new Set<string>()
  for (const m of template.matchAll(TEMPLATE_PLACEHOLDER)) {
    const name = m[1]
    if (TEMPLATE_MESSAGE_FIELD_SET.has(name)) {
      continue
    }
    if (name.startsWith(TAG_PREFIX) && name.length > TAG_PREFIX.length) {
      continue
    }
    if (isReservedCallPlaceholder(name)) {
      continue
    }
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    unknown.push(name)
  }
  return unknown
}

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
