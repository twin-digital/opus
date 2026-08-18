/**
 * A category as an IMAP keyword (d-bl5oamiz). A keyword is an atom: one or more
 * characters that are not "(", ")", "{", space, a control character, "%", "*",
 * a double quote, "\", or "]" (f-xltd4r4v). A category names itself in what a
 * keyword admits (d-8v30vkou), so a category the user typed carries straight
 * across.
 *
 * A category composed from a template is a different matter: what the user saved
 * is checked for the characters its own text carries, and what a triage rendered
 * is made carriable before it is applied (d-mbh2pthe). {@link makeCarriable} is
 * the second half — each character a keyword cannot carry becomes an underscore,
 * and the caller records what was applied.
 */

/** The characters an IMAP keyword may not carry, control characters aside. */
const BARRED = new Set(['(', ')', '{', ' ', '%', '*', '"', '\\', ']'])

/** The code points of `value`, one per element. */
function characters(value: string): string[] {
  return Array.from(value)
}

/** Is `ch` a character a keyword cannot carry? */
function isBarred(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return BARRED.has(ch) || code < 0x20 || code === 0x7f
}

/** Can `value` be carried as an IMAP keyword exactly as it is? */
export function isCarriableKeyword(value: string): boolean {
  return value.length > 0 && ![...characters(value)].some(isBarred)
}

/** The characters of `value` a keyword cannot carry, in order, deduplicated. */
export function uncarriableCharacters(value: string): string[] {
  const found: string[] = []
  for (const ch of characters(value)) {
    if (isBarred(ch) && !found.includes(ch)) {
      found.push(ch)
    }
  }
  return found
}

/**
 * The category as it will be applied: every character a keyword cannot carry
 * replaced by an underscore (d-mbh2pthe). An empty rendering has no carriable
 * form and yields null — the run fails rather than applying a marker that says
 * nothing.
 */
export function makeCarriable(value: string): string | null {
  if (value.length === 0) {
    return null
  }
  return [...characters(value)].map((ch) => (isBarred(ch) ? '_' : ch)).join('')
}
