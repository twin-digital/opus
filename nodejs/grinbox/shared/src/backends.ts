import { z } from 'zod'
import type { Contract } from './contract.js'

/**
 * The mail backends grinbox ships, and what an Account of one can carry.
 *
 * A backend implements what it can, and the gap is visible rather than
 * discovered when an operation fails (d-f9tj4wnr). For IMAP the gap is not the
 * backend's but the Account's: which operations an Account supports is read
 * from the server's capabilities and its arrival folder's permanent flags each
 * time grinbox polls it, and stored on the Account (d-bzw8qoiy). Everything
 * else grinbox does reads what was stored.
 */

/**
 * The backends an Account may be added with. `accounts.provider_type` stays an
 * open string in the state (see `enums.ts`) so a backend is added without a
 * migration; this is the set the interface offers today.
 */
export const MAIL_BACKEND_KINDS = ['gmail', 'imap'] as const
export const mailBackendKindSchema = z.enum(MAIL_BACKEND_KINDS)
export type MailBackendKind = z.infer<typeof mailBackendKindSchema>

/**
 * What an Account may or may not be able to do — the Resource operations whose
 * availability turns on the Account rather than on grinbox:
 *  - `apply_category` — the arrival folder admits client-defined keywords
 *    (d-bl5oamiz).
 *  - `archive` / `file` — the server offers a safe move, its own or a copy
 *    followed by a single-message expunge (d-8am29x25).
 *  - `send_message` — the backend sends mail at all; IMAP does not
 *    (d-5h66e3zl).
 *
 * Reading a mailbox and fetching a body are not here: every backend does both,
 * and an Account that could do neither could not be polled at all.
 */
export const ACCOUNT_CAPABILITIES = ['apply_category', 'archive', 'file', 'send_message'] as const
export const accountCapabilitySchema = z.enum(ACCOUNT_CAPABILITIES)
export type AccountCapability = z.infer<typeof accountCapabilitySchema>

/**
 * What an Account supports, as last read when grinbox logged in (d-bzw8qoiy).
 * `supported` is what it can carry; `unsupported` explains each gap in the
 * user's terms, so the interface can say which Accounts cannot carry an
 * operation and why (d-5h66e3zl, r-x3jb6wlq). The reason is prose the backend
 * wrote rather than a code: what makes a gap understandable — an arrival folder
 * that admits no keywords, a server advertising no move — is the backend's to
 * say, and the interface shows it as given.
 *
 * `read_at` is when the declaration was read, in Unix seconds. A capability
 * appears in exactly one of the two members.
 */
export const accountCapabilitiesSchema = z
  .object({
    supported: z.array(accountCapabilitySchema),
    unsupported: z.partialRecord(accountCapabilitySchema, z.string().min(1)),
    read_at: z.number().int(),
  })
  .superRefine((declaration, ctx) => {
    for (const capability of declaration.supported) {
      if (declaration.unsupported[capability] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `'${capability}' is declared both supported and unsupported`,
          path: ['unsupported', capability],
        })
      }
    }
  })
export type AccountCapabilities = z.infer<typeof accountCapabilitiesSchema>

/** Whether the declaration admits `capability`. A missing declaration admits nothing. */
export function accountSupports(declaration: AccountCapabilities | null, capability: AccountCapability): boolean {
  return declaration?.supported.includes(capability) === true
}

/**
 * Why the Account does not carry `capability`, or `null` where it does — and
 * where nothing has been declared yet, since an Account grinbox has not logged
 * in to has no gap to explain.
 */
export function capabilityAbsenceReason(
  declaration: AccountCapabilities | null,
  capability: AccountCapability,
): string | null {
  if (declaration === null || declaration.supported.includes(capability)) {
    return null
  }
  return declaration.unsupported[capability] ?? null
}

const CAPABILITY_SET: ReadonlySet<string> = new Set(ACCOUNT_CAPABILITIES)

/**
 * The capabilities an Operator's Contract needs of the Account it runs on —
 * the declared Resource operations that are Account-dependent, in declaration
 * order. An Operator needing none runs on any Account.
 */
export function capabilitiesRequiredBy(contract: Contract): AccountCapability[] {
  const required: AccountCapability[] = []
  const seen = new Set<string>()
  for (const declaration of contract.resources) {
    for (const operation of declaration.operations) {
      if (!CAPABILITY_SET.has(operation) || seen.has(operation)) {
        continue
      }
      seen.add(operation)
      required.push(operation as AccountCapability)
    }
  }
  return required
}

/**
 * One reason an Account cannot carry part of a configuration (d-qzxvoph1). A
 * configuration is never refused for naming an operation some Account cannot
 * carry: saving the Pipeline and activating it on an Account each warn, naming
 * the Accounts that cannot carry it, and the Operator fails on those Accounts
 * when it runs.
 *
 * The same shape says which Accounts an edition claims no occurrence for, and
 * why (d-5h66e3zl).
 */
export const accountCapabilityWarningSchema = z.object({
  capability: accountCapabilitySchema,
  operator_ids: z.array(z.number().int().positive()),
  account_ids: z.array(z.number().int().positive()),
})
export type AccountCapabilityWarning = z.infer<typeof accountCapabilityWarningSchema>
