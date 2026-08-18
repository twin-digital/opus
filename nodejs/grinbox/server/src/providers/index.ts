/**
 * Provider surface (read path). The backend-agnostic {@link Provider} seam, the
 * Gmail implementation, the injected Gmail-client interface the OAuth task
 * fills, and the `messages` UPSERT the poll loop calls per discovered candidate.
 *
 * The poll loop (next task) consumes:
 *  - `provider.listCandidates(account, cursor)` → `{ backendMessageIds, newCursor }`
 *  - `provider.fetchMetadata(account, id)` → a `FetchedMessage`
 *  - `upsertMessage(db, accountId, fetched)` → `{ messageId, isNew }`
 * then persists `last_history_cursor = newCursor` + `last_polled_at` and
 * enqueues a Triage per `isNew` Message, with the cursor written last
 * (d-sj4u6eyj).
 */

export type {
  CandidateListing,
  Category,
  FetchedMessage,
  MailboxSnapshot,
  Provider,
  ProviderAccount,
  SnapshotEntry,
  ThreadMembership,
} from './provider.js'

// What one Account can carry, read at each poll and read back everywhere else
// (d-bzw8qoiy).
export {
  ACCOUNT_CAPABILITIES,
  type AccountCapabilities,
  type AccountCapability,
  allCapabilities,
  capabilitiesFrom,
  parseCapabilities,
  serializeCapabilities,
  supports,
  unsupportedReason,
} from './account-capabilities.js'

// The IMAP backend: its stored settings, its session seam, the capability
// reading, folder choice, and the category-as-keyword rules.
export {
  IMAP_PASSWORD_KIND,
  IMAP_FOLDER_ROLES,
  IMAP_PROVIDER_TYPE,
  type ImapConnection,
  type ImapFolderRole,
  type ImapFolders,
  type ImapSecurity,
  type ImapSettings,
  imapConnectionSchema,
  imapFoldersSchema,
  imapSecuritySchema,
  imapSettingsSchema,
  parseImapSettings,
} from './imap/imap-settings.js'
export {
  type ImapConnect,
  ImapCredentialRejectedError,
  type ImapFetchedMessage,
  type ImapFolderEntry,
  type ImapFolderListing,
  type ImapFolderState,
  type ImapMoveResult,
  type ImapSession,
} from './imap/imap-client.js'
export { admitsKeywords, hasSafeMove, imapCapabilities } from './imap/imap-capabilities.js'
export { type FolderProposal, matchFolder, proposeFolders, standingOfFolder } from './imap/imap-folders.js'
export { isCarriableKeyword, makeCarriable, uncarriableCharacters } from './imap/keyword.js'
export {
  type ImapCursor,
  ImapProvider,
  type ImapProviderDeps,
  type OpenImapSession,
  cursorAppliesTo,
  parseImapCursor,
  serializeImapCursor,
} from './imap/imap-provider.js'

export {
  fallbackQuery,
  GmailProvider,
  type GmailHistoryPage,
  type GmailListResult,
  type GmailMessagePayload,
  type GmailProviderClient,
  type GmailProviderConfig,
  type GmailThread,
  HistoryIdExpiredError,
  initialSyncQuery,
  isHistoryIdExpired,
} from './gmail-provider.js'

export { parseGmailMessage } from './gmail-shapes.js'

export { loadMessageRow, upsertMessage, type UpsertResult } from './message-upsert.js'
