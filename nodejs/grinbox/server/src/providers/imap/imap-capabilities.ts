/**
 * What an IMAP Account supports, read from the server's capabilities and its
 * arrival folder's permanent flags (d-bzw8qoiy). Pure over what a session
 * reported, so the reading is testable without a server.
 *
 *  - **apply_category** needs the arrival folder to admit client-defined
 *    keywords, which is `\*` in its PERMANENTFLAGS (f-9z8o6n1l). Without it the
 *    Account declares it cannot apply categories rather than storing a keyword
 *    that will not last (d-bl5oamiz).
 *  - **archive** and **file** both move a message out of the arrival folder, and
 *    need a safe move: the server's own MOVE, or a copy plus a UID-scoped
 *    expunge, which is UIDPLUS (d-8am29x25, f-yawjn42g, f-np5bnzew). With
 *    neither, the Account declares it can do neither.
 *  - **send_message** is never supported: an IMAP account does not send
 *    (d-5h66e3zl).
 */

import type { AccountCapabilities, AccountCapability } from '../account-capabilities.js'
import { capabilitiesFrom } from '../account-capabilities.js'

/** PERMANENTFLAGS' `\*`: the mailbox admits client-defined keywords. */
const NEW_KEYWORDS_FLAG = '\\*'

/** Does the folder admit keywords a client defines? */
export function admitsKeywords(permanentFlags: readonly string[]): boolean {
  return permanentFlags.some((flag) => flag === NEW_KEYWORDS_FLAG)
}

/** Can a message be moved out of a folder without risking other mail? */
export function hasSafeMove(capabilities: readonly string[]): boolean {
  const upper = capabilities.map((c) => c.toUpperCase())
  return upper.includes('MOVE') || upper.includes('UIDPLUS')
}

/** Read an IMAP Account's declaration from what its session reported. */
export function imapCapabilities(
  serverCapabilities: readonly string[],
  arrivalPermanentFlags: readonly string[],
  readAt: number,
): AccountCapabilities {
  const supported: AccountCapability[] = []
  if (admitsKeywords(arrivalPermanentFlags)) {
    supported.push('apply_category')
  }
  if (hasSafeMove(serverCapabilities)) {
    supported.push('archive', 'file')
  }
  return capabilitiesFrom(
    supported,
    {
      apply_category: 'the arrival folder does not admit keywords a client defines, so a category would not last',
      archive: 'the server offers neither MOVE nor UIDPLUS, so a message cannot be moved without risking other mail',
      file: 'the server offers neither MOVE nor UIDPLUS, so a message cannot be moved without risking other mail',
      send_message: 'an IMAP account reads mail and does not send it',
    },
    readAt,
  )
}
