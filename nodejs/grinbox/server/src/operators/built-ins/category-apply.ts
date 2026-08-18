/**
 * Applying a Category composed from a template, shared by Apply Category and
 * Set Aside.
 *
 * A Category's template is checked as far as it is knowable and its result when
 * it renders (d-mbh2pthe): the save refused a template whose own text carried a
 * character a Category may not, and here each such character the rendering
 * produced becomes an underscore. A rendering that came out empty has no name to
 * write, so nothing is applied and the run fails (d-i1cae43j).
 *
 * What the run records is the Category actually applied, not the one the
 * template composed — the metered client's success event carries the name the
 * mailbox now holds.
 */

import { sanitizeCategoryName } from '@grinbox/shared'
import type { MailboxClient, MessageView } from '../types.js'
import { renderTemplate } from './template.js'

/** Thrown when a Category template rendered to nothing. */
export class EmptyCategoryError extends Error {
  override readonly name = 'EmptyCategoryError'
}

/** Thrown when the apply_category call itself failed after the client's retries. */
export class CategoryApplyError extends Error {
  override readonly name = 'CategoryApplyError'
}

/**
 * Render `template`, make the result carriable, and apply it. Returns the
 * Category actually applied on success, or null where the Limit denied the call
 * — an Action's outside effect is optional, so a denial is an outcome rather
 * than a failed run.
 */
export async function applyRenderedCategory(
  client: MailboxClient,
  template: string,
  message: MessageView,
  tags: ReadonlyMap<string, string>,
): Promise<string | null> {
  const applied = sanitizeCategoryName(renderTemplate(template, message, tags))
  if (applied.length === 0) {
    throw new EmptyCategoryError('the category template rendered to nothing, so no category was applied')
  }

  const result = await client.apply_category({
    backendMessageId: message.backendMessageId,
    category: applied,
  })

  switch (result.outcome) {
    case 'succeeded':
      return applied
    case 'skipped_by_limit':
      return null
    case 'failed':
      throw new CategoryApplyError(`apply_category failed: ${result.error.message}`)
  }
}
