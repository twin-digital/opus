/**
 * A tiny, safe, deterministic prompt-template renderer for the LLM Tagger (O2).
 * It performs **substitution only** over a fixed placeholder set — there is NO
 * `eval` / `new Function` / dynamic code, and no expression grammar (that is
 * O1's separate concern in `match-expression.ts`; this helper only reads the
 * same Message/Tag surface and is intentionally not entangled with it).
 *
 * ## Syntax
 *
 * Placeholders are `{{ name }}` (surrounding whitespace inside the braces is
 * ignored). Supported names:
 *  - `{{from}}` `{{to}}` `{{subject}}` `{{snippet}}` `{{body}}` — Message fields
 *    (`body` is the plain-text body, capped at
 *    {@link BODY_PLACEHOLDER_MAX_CHARS} characters so a huge body cannot blow
 *    up a prompt). A `null`/absent field renders as the empty string.
 *  - `{{tag.<key>}}` — the input Tag value for `<key>` in the current Triage's
 *    scope; an absent Tag renders as the empty string.
 *
 * ## Unknown placeholders
 *
 * Any placeholder whose name isn't recognized (an unknown field, a misspelled
 * `tag.` key path, etc.) renders as the **empty string**. This is the
 * deliberate choice: a Tagger's prompt should degrade rather than fail or leak
 * the literal `{{...}}` text into the model. (Compare O1, where an unknown
 * field also resolves to `""`.) Non-placeholder text — including a lone `{` or
 * unmatched braces — is passed through verbatim.
 */

import { TEMPLATE_PLACEHOLDER } from '@grinbox/shared'
import type { MessageView } from '../types.js'

/**
 * Matches a single `{{ ... }}` placeholder; the inner name is captured. The
 * pattern is owned by `@grinbox/shared` so this renderer and the Contract's
 * template tag-ref derivation (`extractTemplateTagRefs`) share one grammar.
 */
const PLACEHOLDER = TEMPLATE_PLACEHOLDER

/**
 * The maximum characters a `{{body}}` placeholder renders (16 KiB), inclusive
 * of {@link BODY_TRUNCATION_MARKER}. The stored `messages.body_text` is kept
 * complete; the cap applies at substitution time so prompts stay bounded
 * regardless of how large a Message body is. A capped body ends with the
 * marker so the model (or a human reading the rendered output) can tell it was
 * cut.
 */
export const BODY_PLACEHOLDER_MAX_CHARS = 16_384

/** Ends a capped `{{body}}` rendering; counted within the cap. */
export const BODY_TRUNCATION_MARKER = '\n[body truncated]'

/**
 * Cap the body at {@link BODY_PLACEHOLDER_MAX_CHARS}, marking a truncation.
 * The marker fits inside the cap, so the rendering never exceeds it.
 */
function renderBody(bodyText: string): string {
  if (bodyText.length <= BODY_PLACEHOLDER_MAX_CHARS) {
    return bodyText
  }
  return bodyText.slice(0, BODY_PLACEHOLDER_MAX_CHARS - BODY_TRUNCATION_MARKER.length) + BODY_TRUNCATION_MARKER
}

/** Resolves one placeholder name to its string value (unknown → `""`). */
function resolvePlaceholder(name: string, message: MessageView, tags: ReadonlyMap<string, string>): string {
  if (name.startsWith('tag.')) {
    const key = name.slice('tag.'.length)
    return tags.get(key) ?? ''
  }
  switch (name) {
    case 'from':
      return message.from ?? ''
    case 'to':
      return message.to ?? ''
    case 'subject':
      return message.subject ?? ''
    case 'snippet':
      return message.snippet ?? ''
    case 'body':
      return renderBody(message.bodyText ?? '')
    default:
      // Unknown placeholder → empty string (documented above).
      return ''
  }
}

/**
 * Renders `template`, substituting every `{{ ... }}` placeholder against the
 * Message and input Tags. Pure and deterministic; non-placeholder text passes
 * through unchanged.
 */
export function renderTemplate(template: string, message: MessageView, tags: ReadonlyMap<string, string>): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => resolvePlaceholder(name, message, tags))
}
