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
 * enqueues a Triage per `isNew` Message, all in one transaction
 * (pipeline-runtime.md "Provider polling").
 */

export type {
  CandidateListing,
  Category,
  FetchedMessage,
  Provider,
  ProviderAccount,
  ThreadMembership,
} from './provider.js'

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
