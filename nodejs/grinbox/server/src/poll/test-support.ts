/**
 * Test-only helpers for the poll-loop tests: a {@link StubProvider} that yields
 * fixture Messages from `listCandidates`/`fetchMetadata` with no network, and
 * small seeding helpers. Not exported from the package barrel — colocated for
 * the poll tests (mirrors `pipeline/test-helpers.ts`).
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type {
  CandidateListing,
  Category,
  FetchedMessage,
  Provider,
  ProviderAccount,
  ReconcileSnapshot,
  ThreadMembership,
} from '../providers/provider.js'

/** A fixture backend Message the stub Provider serves. */
export interface FixtureMessage {
  readonly id: string
  readonly subject: string
  readonly from: string
}

/**
 * A scripted {@link Provider}: each `listCandidates` call returns the next
 * scripted page (ids + cursor); `fetchMetadata` returns a {@link FetchedMessage}
 * built from the fixture registered for the id. Records calls for assertions.
 */
export class StubProvider implements Provider {
  /** Successive `listCandidates` results, consumed one per call. The last entry
   * is reused if `listCandidates` is called more times than scripted. */
  private readonly pages: CandidateListing[]
  private readonly fixtures: Map<string, FixtureMessage>
  private pageIndex = 0
  listCandidatesCalls = 0
  fetchMetadataCalls: string[] = []
  /** Present-id snapshot returned by `reconcile` (settable per test). */
  reconcilePresentIds: string[] = []
  reconcileCalls = 0

  constructor(pages: CandidateListing[], fixtures: FixtureMessage[]) {
    this.pages = pages
    this.fixtures = new Map(fixtures.map((f) => [f.id, f]))
  }

  listCandidates(_account: ProviderAccount, _cursor: string | null): Promise<CandidateListing> {
    this.listCandidatesCalls++
    const idx = Math.min(this.pageIndex, this.pages.length - 1)
    this.pageIndex++
    // `idx` is -1 when no pages were configured.
    const page = this.pages[idx] as CandidateListing | undefined
    if (page === undefined) {
      return Promise.resolve({ backendMessageIds: [], newCursor: 'EMPTY' })
    }
    return Promise.resolve(page)
  }

  fetchMetadata(_account: ProviderAccount, backendMessageId: string): Promise<FetchedMessage> {
    this.fetchMetadataCalls.push(backendMessageId)
    const fx = this.fixtures.get(backendMessageId)
    return Promise.resolve({
      backendMessageId,
      backendThreadId: null,
      from: fx?.from ?? null,
      to: 'me@example.com',
      subject: fx?.subject ?? null,
      snippet: fx?.subject ?? null,
      receivedAt: 5000,
      headers: { subject: fx?.subject ?? '' },
      bodyFetched: false,
    })
  }

  applyCategory(_account: ProviderAccount, _backendMessageId: string, _category: Category): Promise<void> {
    return Promise.resolve()
  }

  threadMembership(_account: ProviderAccount, _backendMessageId: string): Promise<ThreadMembership> {
    return Promise.resolve({
      backendThreadId: null,
      isReply: false,
      messageCount: 0,
    })
  }

  reconcile(_account: ProviderAccount): Promise<ReconcileSnapshot> {
    this.reconcileCalls++
    return Promise.resolve({ presentBackendIds: this.reconcilePresentIds })
  }
}

/** Seed a user; return its id. */
export async function seedUser(db: Kysely<Database>): Promise<number> {
  const u = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  return u.id
}

/** Seed a pipeline for `userId`; return its id. */
export async function seedPipeline(db: Kysely<Database>, userId: number): Promise<number> {
  const p = await db
    .insertInto('pipelines')
    .values({ user_id: userId, name: 'p', description: null, created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  return p.id
}

/** Seed an account; return its id. `overrides` patches the inserted row. */
export async function seedAccount(
  db: Kysely<Database>,
  userId: number,
  overrides: {
    activePipelineId?: number | null
    pollIntervalSeconds?: number
    lastPolledAt?: number | null
    lastHistoryCursor?: string | null
    name?: string
  } = {},
): Promise<number> {
  const a = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: overrides.name ?? 'a',
      provider_type: 'gmail',
      active_pipeline_id: overrides.activePipelineId ?? null,
      settings_json: JSON.stringify({ email: 'u@example.com' }),
      poll_interval_seconds: overrides.pollIntervalSeconds ?? 600,
      last_polled_at: overrides.lastPolledAt ?? null,
      last_history_cursor: overrides.lastHistoryCursor ?? null,
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return a.id
}
