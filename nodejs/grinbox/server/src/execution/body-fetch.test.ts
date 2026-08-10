import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import type { MailboxClient, MakeResourceClient } from '../operators/types.js'
import { type SeedResult, freshDb, seedBase } from '../pipeline/test-helpers.js'
import { type BodyFetchRun, ensureMessageBody, runConsumesBody } from './body-fetch.js'

/** A run row for an llm_tagger whose prompt is `template`. */
function llmRun(template: string): BodyFetchRun {
  return {
    type_key: 'llm_tagger',
    op_config_json: JSON.stringify({
      model_id: 'anthropic.claude',
      prompt_template: template,
      outputs: [{ tag_key: 'kind', value_enum: ['a', 'b'] }],
    }),
  }
}

describe('runConsumesBody', () => {
  it('is true for an llm_tagger prompt referencing {{body}}', () => {
    expect(runConsumesBody(llmRun('classify {{body}}'))).toBe(true)
  })

  it('is false for a prompt without {{body}}', () => {
    expect(runConsumesBody(llmRun('classify {{subject}}'))).toBe(false)
  })

  it('is true for a rule_based_tagger Rule reading the body field', () => {
    expect(
      runConsumesBody({
        type_key: 'rule_based_tagger',
        op_config_json: JSON.stringify({
          output_tag_key: 'kind',
          output_value_enum: ['yes', 'no'],
          rules: [{ match: 'body contains "invoice"', output: 'yes' }],
          fallback: { output: 'no' },
        }),
      }),
    ).toBe(true)
  })

  it('is false for an unknown type_key', () => {
    expect(runConsumesBody({ type_key: 'nope', op_config_json: '{}' })).toBe(false)
  })

  it('is false for malformed config JSON', () => {
    expect(runConsumesBody({ type_key: 'llm_tagger', op_config_json: 'not json' })).toBe(false)
  })

  it('is false for config that fails the type schema', () => {
    expect(runConsumesBody({ type_key: 'llm_tagger', op_config_json: '{}' })).toBe(false)
  })
})

describe('ensureMessageBody', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  /** A factory whose mailbox client's fetch_body resolves `result`. */
  function factoryReturning(result: Awaited<ReturnType<MailboxClient['fetch_body']>>): {
    factory: MakeResourceClient
    fetchBody: ReturnType<typeof vi.fn>
  } {
    const fetchBody = vi.fn(async () => result)
    const factory = ((_resource: string, _ops: readonly string[]) => ({
      fetch_body: fetchBody,
    })) as unknown as MakeResourceClient
    return { factory, fetchBody }
  }

  async function messageRow() {
    return db
      .selectFrom('messages')
      .select(['id', 'backend_message_id', 'body_text', 'body_html', 'body_fetched_at'])
      .where('id', '=', seed.messageId)
      .executeTakeFirstOrThrow()
  }

  it('fetches, persists, and returns the body for a body-consuming run', async () => {
    const { factory, fetchBody } = factoryReturning({
      outcome: 'succeeded',
      value: { bodyText: 'plain', bodyHtml: '<p>plain</p>' },
    })

    const body = await ensureMessageBody(db, llmRun('classify {{body}}'), await messageRow(), factory)

    expect(body).toEqual({ body_text: 'plain', body_html: '<p>plain</p>' })
    expect(fetchBody).toHaveBeenCalledWith({ backendMessageId: 'm1' })

    const row = await messageRow()
    expect(row.body_text).toBe('plain')
    expect(row.body_html).toBe('<p>plain</p>')
    expect(row.body_fetched_at).not.toBeNull()
  })

  it('does not fetch when the run does not consume the body', async () => {
    const { factory, fetchBody } = factoryReturning({
      outcome: 'succeeded',
      value: { bodyText: 'x', bodyHtml: null },
    })

    const body = await ensureMessageBody(db, llmRun('classify {{subject}}'), await messageRow(), factory)

    expect(fetchBody).not.toHaveBeenCalled()
    expect(body).toEqual({ body_text: null, body_html: null })
    expect((await messageRow()).body_fetched_at).toBeNull()
  })

  it('does not refetch once body_fetched_at is set, even for an empty body', async () => {
    // Simulate a prior attempt that found no body (data-model.md: non-NULL
    // body_fetched_at with empty body fields means "attempted; genuinely none").
    await db.updateTable('messages').set({ body_fetched_at: 999 }).where('id', '=', seed.messageId).execute()
    const { factory, fetchBody } = factoryReturning({
      outcome: 'succeeded',
      value: { bodyText: 'x', bodyHtml: null },
    })

    const body = await ensureMessageBody(db, llmRun('classify {{body}}'), await messageRow(), factory)

    expect(fetchBody).not.toHaveBeenCalled()
    expect(body).toEqual({ body_text: null, body_html: null })
  })

  it('degrades on a failed fetch: stored (null) body, no cache write', async () => {
    const { factory } = factoryReturning({
      outcome: 'failed',
      error: new Error('boom'),
    })

    const body = await ensureMessageBody(db, llmRun('classify {{body}}'), await messageRow(), factory)

    expect(body).toEqual({ body_text: null, body_html: null })
    // body_fetched_at stays NULL so a later Triage retries the fetch.
    expect((await messageRow()).body_fetched_at).toBeNull()
  })

  it('degrades on a limit-skipped fetch the same way', async () => {
    const { factory } = factoryReturning({
      outcome: 'skipped_by_limit',
      limit_id: 7,
      scope: 'per_window',
    })

    const body = await ensureMessageBody(db, llmRun('classify {{body}}'), await messageRow(), factory)

    expect(body).toEqual({ body_text: null, body_html: null })
    expect((await messageRow()).body_fetched_at).toBeNull()
  })

  it('coalesces concurrent callers onto one in-flight fetch', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    const fetchBody = vi.fn(async () => {
      await gate
      return {
        outcome: 'succeeded' as const,
        value: { bodyText: 'plain', bodyHtml: null },
      }
    })
    const factory = (() => ({
      fetch_body: fetchBody,
    })) as unknown as MakeResourceClient

    const row = await messageRow()
    const inflight = new Map<number, Promise<{ body_text: string | null; body_html: string | null }>>()
    const run = llmRun('classify {{body}}')
    const [a, b] = await Promise.all([
      ensureMessageBody(db, run, row, factory, inflight),
      (async () => {
        // Let the first caller register its fetch, then release it.
        await Promise.resolve()
        const second = ensureMessageBody(db, run, row, factory, inflight)
        release?.()
        return second
      })(),
    ])

    expect(fetchBody).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ body_text: 'plain', body_html: null })
    expect(b).toEqual(a)
    expect(inflight.size).toBe(0)
  })

  it('reuses a body cached after the caller loaded its row snapshot', async () => {
    const staleRow = await messageRow() // body_fetched_at NULL in this snapshot
    await db
      .updateTable('messages')
      .set({ body_text: 'cached', body_html: null, body_fetched_at: 999 })
      .where('id', '=', seed.messageId)
      .execute()
    const { factory, fetchBody } = factoryReturning({
      outcome: 'succeeded',
      value: { bodyText: 'refetched', bodyHtml: null },
    })

    const body = await ensureMessageBody(db, llmRun('classify {{body}}'), staleRow, factory)

    expect(fetchBody).not.toHaveBeenCalled()
    expect(body).toEqual({ body_text: 'cached', body_html: null })
  })

  it('a degraded fetch releases the single-flight slot for a later retry', async () => {
    const { factory: failing, fetchBody: failingFetch } = factoryReturning({
      outcome: 'failed',
      error: new Error('boom'),
    })
    const run = llmRun('classify {{body}}')
    const inflight = new Map<number, Promise<{ body_text: string | null; body_html: string | null }>>()

    await ensureMessageBody(db, run, await messageRow(), failing, inflight)
    expect(inflight.size).toBe(0)

    const { factory: succeeding, fetchBody: succeedingFetch } = factoryReturning({
      outcome: 'succeeded',
      value: { bodyText: 'plain', bodyHtml: null },
    })
    const body = await ensureMessageBody(db, run, await messageRow(), succeeding, inflight)

    expect(failingFetch).toHaveBeenCalledTimes(1)
    expect(succeedingFetch).toHaveBeenCalledTimes(1)
    expect(body).toEqual({ body_text: 'plain', body_html: null })
  })

  it('persists an empty fetch result as attempted (nulls + body_fetched_at)', async () => {
    const { factory } = factoryReturning({
      outcome: 'succeeded',
      value: { bodyText: null, bodyHtml: null },
    })

    const body = await ensureMessageBody(db, llmRun('classify {{body}}'), await messageRow(), factory)

    expect(body).toEqual({ body_text: null, body_html: null })
    const row = await messageRow()
    expect(row.body_text).toBeNull()
    expect(row.body_fetched_at).not.toBeNull()
  })
})
