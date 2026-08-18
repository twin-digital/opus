import { TEMPLATE_PLACEHOLDER } from './template-placeholder.js'

/**
 * What a Category name may contain (d-8v30vkou) and how a Category template is
 * checked (d-mbh2pthe). A Category is carried as an IMAP keyword on backends
 * that store it that way, and a keyword is an atom: eight characters and the
 * control range are barred from it.
 *
 * Two checks, at two moments:
 *  - **at save** — the template's own literal text is checked, and a barred
 *    character in it refuses the save, naming it. Placeholders are skipped:
 *    what they render is unknown until a Triage runs.
 *  - **at run** — each barred character the rendering produced becomes an
 *    underscore, the Category is applied, and the run records what was applied.
 */

/**
 * The characters a Category may not contain, beside the control range
 * (d-8v30vkou). Named individually so a refusal can report the offender.
 */
export const CATEGORY_FORBIDDEN_CHARS = ['(', ')', '{', ' ', '%', '*', '"', '\\', ']'] as const

const FORBIDDEN_SET: ReadonlySet<string> = new Set(CATEGORY_FORBIDDEN_CHARS)

/** The replacement a barred character becomes when a rendering produces one. */
export const CATEGORY_REPLACEMENT_CHAR = '_'

/** Whether `char` is barred from a Category — a named character or a control character. */
function isForbidden(char: string): boolean {
  if (FORBIDDEN_SET.has(char)) {
    return true
  }
  const code = char.codePointAt(0) ?? 0
  return code < 0x20 || code === 0x7f
}

/**
 * The distinct barred characters in `text`, in first-seen order. A control
 * character is reported as its `\uXXXX` escape so a refusal names something
 * the user can read.
 */
export function forbiddenCategoryChars(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const char of text) {
    if (!isForbidden(char) || seen.has(char)) {
      continue
    }
    seen.add(char)
    found.push(FORBIDDEN_SET.has(char) ? char : `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`)
  }
  return found
}

/** Whether `name` is a Category a backend can carry: non-empty and barring none. */
export function isValidCategoryName(name: string): boolean {
  return name.length > 0 && forbiddenCategoryChars(name).length === 0
}

/**
 * The barred characters a Category template's own text carries — the literal
 * segments, with every `{{ … }}` placeholder removed (d-mbh2pthe). A save is
 * refused when this is non-empty, naming what it found. A template made
 * entirely of placeholders carries none, and what it renders is made carriable
 * at run time by {@link sanitizeCategoryName} instead.
 */
export function forbiddenCategoryTemplateChars(template: string): string[] {
  return forbiddenCategoryChars(template.replace(TEMPLATE_PLACEHOLDER, ''))
}

/**
 * The Category actually applied for a rendered template: each barred character
 * becomes an underscore (d-mbh2pthe). The result is what the run records, so
 * the user sees the name their mailbox carries rather than the one the
 * template composed.
 *
 * A rendering that came out empty stays empty — the caller applies no Category
 * and fails the run, since there is no name to write.
 */
export function sanitizeCategoryName(rendered: string): string {
  let out = ''
  for (const char of rendered) {
    out += isForbidden(char) ? CATEGORY_REPLACEMENT_CHAR : char
  }
  return out
}
