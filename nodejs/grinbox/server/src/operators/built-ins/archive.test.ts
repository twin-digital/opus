import type { LimitScope, ResourceOpResult } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'
import { runOperator } from '../run.js'
import { createFakeResourceClients } from '../testing.js'
import type { MessageView } from '../types.js'
import { ArchiveError } from './archive.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'gmail-abc',
    from: 'alice@example.com',
    from_email: 'alice@example.com',
    from_domain: 'example.com',
    to: 'me@example.com',
    subject: 'Weekly newsletter',
    snippet: 'this week in…',
    bodyText: null,
    bodyHtml: null,
    receivedAt: 0,
    takenInAt: 1000,
    headers: new Map(),
    thread: null,
    ...over,
  }
}

interface ArchiveConfigShape {
  when?: { tag_key: string; equals: [string, ...string[]] }
  delay_seconds?: number
}

function snapshot(config: ArchiveConfigShape = {}) {
  return {
    type_key: 'archive',
    type_code_version: '1',
    op_config_json: JSON.stringify(config),
  }
}

function args(canned: ResourceOpResult<unknown> | undefined, tags: Record<string, string> = {}) {
  const fake = createFakeResourceClients(canned ? { canned: { 'mailbox.archive': canned } } : {})
  return {
    fake,
    runArgs: {
      message: message(),
      tags: new Map(Object.entries(tags)),
      makeResourceClient: fake.factory,
      signal: new AbortController().signal,
    },
  }
}

function archived(): ResourceOpResult<unknown> {
  return { outcome: 'succeeded', value: { archived: true } }
}

describe('archive run', () => {
  it('archives the Message (passes the backend id, returns no Tags)', async () => {
    const { fake, runArgs } = args(archived())
    const result = await runOperator(snapshot(), runArgs)

    expect(result.tags).toEqual([])
    const call = fake.calls.find((c) => c.operation === 'archive')
    expect(call).toBeDefined()
    expect(call?.args).toEqual({ backendMessageId: 'gmail-abc' })
  })

  it('clean no-op when the optional `when` gate does not match', async () => {
    const { fake, runArgs } = args(archived(), { disposition: 'keep' })
    const result = await runOperator(snapshot({ when: { tag_key: 'disposition', equals: ['archive'] } }), runArgs)
    expect(result.tags).toEqual([])
    expect(fake.calls.find((c) => c.operation === 'archive')).toBeUndefined()
  })

  it('clean no-op when the gated Tag was never produced', async () => {
    const { fake, runArgs } = args(archived())
    const result = await runOperator(snapshot({ when: { tag_key: 'disposition', equals: ['archive'] } }), runArgs)
    expect(result.tags).toEqual([])
    expect(fake.calls.find((c) => c.operation === 'archive')).toBeUndefined()
  })

  it('fires when the optional `when` gate matches', async () => {
    const { fake, runArgs } = args(archived(), { disposition: 'archive' })
    await runOperator(snapshot({ when: { tag_key: 'disposition', equals: ['archive'] } }), runArgs)
    expect(fake.calls.find((c) => c.operation === 'archive')).toBeDefined()
  })

  it('skipped_by_limit is a clean no-op (not a failure)', async () => {
    const skipped: ResourceOpResult<unknown> = {
      outcome: 'skipped_by_limit',
      limit_id: 9,
      scope: 'per_window' satisfies LimitScope,
    }
    const { runArgs } = args(skipped)
    const result = await runOperator(snapshot(), runArgs)
    expect(result.tags).toEqual([])
  })

  it('failed result makes the run throw', async () => {
    const failed: ResourceOpResult<unknown> = {
      outcome: 'failed',
      error: new Error('gmail 500'),
    }
    const { runArgs } = args(failed)
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(ArchiveError)
  })
})

describe('archive with a delay (d-grcdd4ov)', () => {
  it('records a pending archive instead of calling the mailbox', async () => {
    const { fake, runArgs } = args(archived())
    const result = await runOperator(snapshot({ delay_seconds: 3600 }), runArgs)

    expect(fake.calls.find((c) => c.operation === 'archive')).toBeUndefined()
    expect(result.tags).toEqual([])
    expect(result.events).toEqual([
      {
        eventType: 'pending_archive_recorded',
        // The message fixture's take-in is 1000.
        detailsJson: JSON.stringify({ due_at: 4600, delay_seconds: 3600 }),
      },
    ])
  })

  it('measures the delay from the take-in, not the triage', async () => {
    const { runArgs } = args(archived())
    const result = await runOperator(snapshot({ delay_seconds: 60 }), {
      ...runArgs,
      message: { ...runArgs.message, takenInAt: 5_000, receivedAt: 4_000 },
    })
    expect(JSON.parse(result.events?.[0]?.detailsJson ?? 'null')).toMatchObject({ due_at: 5_060 })
  })

  it('records nothing when the gate does not fire', async () => {
    const { fake, runArgs } = args(archived(), { disposition: 'keep' })
    const result = await runOperator(
      snapshot({ delay_seconds: 60, when: { tag_key: 'disposition', equals: ['archive'] } }),
      runArgs,
    )
    expect(result.events ?? []).toEqual([])
    expect(fake.calls.find((c) => c.operation === 'archive')).toBeUndefined()
  })

  it('archives during the triage when no delay is stored', async () => {
    const { fake, runArgs } = args(archived())
    const result = await runOperator(snapshot({}), runArgs)
    expect(fake.calls.find((c) => c.operation === 'archive')).toBeDefined()
    expect(result.events ?? []).toEqual([])
  })
})
