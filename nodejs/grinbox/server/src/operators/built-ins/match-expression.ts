/**
 * Server-side adapter over the shared `match` expression parser
 * (`@twin-digital/grinbox-shared`). The parser itself is dependency-free of server types and
 * reads field values through a {@link FieldLookup} callback; this module bridges
 * the server's {@link MessageView} + input Tags to that callback, preserving the
 * grammar's exact field semantics (raw `from`/`to`, lowercased headers,
 * `thread.*` → `"yes"`/`"no"` / count string, derived `from_email`/`from_domain`).
 *
 * The grammar, error model, and field-lookup key encoding live in the shared
 * module's header.
 */

import { type CompiledMatch, type FieldLookup, MatchExpressionError, compileMatch } from '@twin-digital/grinbox-shared'
import type { MessageView } from '../types.js'

export { type CompiledMatch, MatchExpressionError, compileMatch }

/** The evaluation context: the Message and the input Tags in Triage scope. */
export interface MatchContext {
  readonly message: MessageView
  readonly tags: ReadonlyMap<string, string>
}

/**
 * Builds the shared parser's {@link FieldLookup} from a {@link MatchContext}.
 * Maps each canonical field key the compiled evaluator requests to the matching
 * `MessageView` / Tag value (absent → `""`), keeping the grammar's semantics:
 *  - bare Message fields read the raw header (`from`/`to`) or text fields, plus
 *    the derived `from_email` / `from_domain`;
 *  - `header.<lowercased-name>` reads the (already-lowercased) header map;
 *  - `tag.<key>` reads the input Tags;
 *  - `thread.is_reply` → `"yes"`/`"no"`, `thread.message_count` → count string,
 *    with not-in-a-Thread defaults.
 */
export function buildFieldLookup(ctx: MatchContext): FieldLookup {
  const m = ctx.message
  return (key) => {
    if (key.startsWith('tag.')) {
      return ctx.tags.get(key.slice(4)) ?? ''
    }
    if (key.startsWith('header.')) {
      return m.headers.get(key.slice(7)) ?? ''
    }
    switch (key) {
      case 'thread.is_reply':
        return m.thread?.isReply ? 'yes' : 'no'
      case 'thread.message_count':
        return String(m.thread?.messageCount ?? 0)
      case 'from':
        return m.from ?? ''
      case 'from_email':
        return m.from_email
      case 'from_domain':
        return m.from_domain
      case 'to':
        return m.to ?? ''
      case 'subject':
        return m.subject ?? ''
      case 'snippet':
        return m.snippet ?? ''
      case 'body':
        return m.bodyText ?? ''
      default:
        return ''
    }
  }
}
