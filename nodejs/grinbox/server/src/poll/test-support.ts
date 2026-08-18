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
  MailboxSnapshot,
  Provider,
  ProviderAccount,
  SnapshotEntry,
  ThreadMembership,
} from '../providers/provider.js'
import type { AccountCapabilityDeclaration } from '../providers/account-capabilities.js'
import { allCapabilities } from '../providers/account-capabilities.js'

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
  /** Standings returned by `snapshot` (settable per test). Bare ids may also be
   * set through {@link reconcilePresentIds}, which reports each as `present`. */
  snapshotEntries: SnapshotEntry[] = []
  reconcileCalls = 0
  declareCapabilitiesCalls = 0
  /** What `declareCapabilities` reports; every capability by default. */
  capabilities: AccountCapabilityDeclaration = allCapabilities(0)

  /** Convenience for tests that only care which ids are present. */
  set reconcilePresentIds(ids: string[]) {
    this.snapshotEntries = ids.map((backendMessageId) => ({ backendMessageId, state: 'present' }))
  }

  constructor(pages: CandidateListing[], fixtures: FixtureMessage[]) {
    this.pages = pages
    this.fixtures = new Map(fixtures.map((f) => [f.id, f]))
  }

  async listCandidates(_account: ProviderAccount, _cursor: string | null): Promise<CandidateListing> {
    this.listCandidatesCalls++
    const idx = Math.min(this.pageIndex, this.pages.length - 1)
    this.pageIndex++
    const page = this.pages.at(idx)
    if (page === undefined) {
      return { backendMessageIds: [], newCursor: 'EMPTY' }
    }
    return page
  }

  async fetchMetadata(_account: ProviderAccount, backendMessageId: string): Promise<FetchedMessage> {
    this.fetchMetadataCalls.push(backendMessageId)
    const fx = this.fixtures.get(backendMessageId)
    return {
      backendMessageId,
      backendThreadId: null,
      from: fx?.from ?? null,
      to: 'me@example.com',
      subject: fx?.subject ?? null,
      snippet: fx?.subject ?? null,
      receivedAt: 5000,
      headers: { subject: fx?.subject ?? '' },
      bodyFetched: false,
    }
  }

  async applyCategory(_account: ProviderAccount, _backendMessageId: string, _category: Category): Promise<void> {}

  async threadMembership(_account: ProviderAccount, _backendMessageId: string): Promise<ThreadMembership> {
    return { backendThreadId: null, isReply: false, messageCount: 0 }
  }

  async snapshot(_account: ProviderAccount): Promise<MailboxSnapshot> {
    this.reconcileCalls++
    return { entries: this.snapshotEntries }
  }

  async declareCapabilities(_account: ProviderAccount): Promise<AccountCapabilityDeclaration> {
    this.declareCapabilitiesCalls++
    return this.capabilities
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
