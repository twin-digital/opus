import type { LimitScope, ResourceOpResult } from '@twin-digital/grinbox-shared'
import { describe, expect, it } from 'vitest'
import { runOperator } from '../run.js'
import { createFakeResourceClients } from '../testing.js'
import type { MessageView } from '../types.js'
import { NotifyError } from './notify.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'm1',
    from: 'alice@example.com',
    from_email: 'alice@example.com',
    from_domain: 'example.com',
    to: 'me@example.com',
    subject: 'Invoice #42 due',
    snippet: 'please pay',
    bodyText: 'the full body text',
    bodyHtml: null,
    receivedAt: 0,
    headers: new Map(),
    thread: null,
    ...over,
  }
}

interface NotifyConfigShape {
  message_template: string
  credentials_id: number
  when?: { tag_key: string; equals: [string, ...string[]] }
}

const CONFIG: NotifyConfigShape = {
  message_template: '{{from}}: {{subject}} (urgency={{tag.urgency}})',
  credentials_id: 7,
}

function snapshot(configOver: Partial<NotifyConfigShape> = {}) {
  return {
    type_key: 'notify',
    type_code_version: '1',
    op_config_json: JSON.stringify({ ...CONFIG, ...configOver }),
  }
}

function args(canned: ResourceOpResult<unknown> | undefined, tags: Record<string, string> = {}) {
  const fake = createFakeResourceClients(canned ? { canned: { 'pushover_api.send_notification': canned } } : {})
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

function pushoverSucceeded(): ResourceOpResult<unknown> {
  return { outcome: 'succeeded', value: { message_id: 'p1' } }
}

describe('notify run', () => {
  it('fires (renders + calls send_notification) when no `when` gate', async () => {
    const { fake, runArgs } = args(pushoverSucceeded(), { urgency: 'high' })
    const result = await runOperator(snapshot(), runArgs)

    expect(result.tags).toEqual([])
    const call = fake.calls.find((c) => c.operation === 'send_notification')
    expect(call).toBeDefined()
    const sent = call?.args as {
      message: string
      url?: string
      url_title?: string
    }
    // Template renders Message fields and Tags.
    expect(sent.message).toBe('alice@example.com: Invoice #42 due (urgency=high)')
    // The push deep-links back to the triggering Message in Gmail.
    expect(sent.url).toBe('https://mail.google.com/mail/u/0/#all/m1')
    expect(sent.url_title).toBe('Open in Gmail')
  })

  it('fires when the `when` gate matches the current Tag', async () => {
    const { fake, runArgs } = args(pushoverSucceeded(), { urgency: 'high' })
    await runOperator(snapshot({ when: { tag_key: 'urgency', equals: ['high'] } }), runArgs)
    expect(fake.calls.find((c) => c.operation === 'send_notification')).toBeDefined()
  })

  it('clean no-op when the `when` gate does not match (no Resource call)', async () => {
    const { fake, runArgs } = args(pushoverSucceeded(), { urgency: 'low' })
    const result = await runOperator(snapshot({ when: { tag_key: 'urgency', equals: ['high'] } }), runArgs)
    expect(result.tags).toEqual([])
    expect(fake.calls.find((c) => c.operation === 'send_notification')).toBeUndefined()
  })

  it('clean no-op when the gated Tag was never produced', async () => {
    const { fake, runArgs } = args(pushoverSucceeded(), {})
    const result = await runOperator(snapshot({ when: { tag_key: 'urgency', equals: ['high'] } }), runArgs)
    expect(result.tags).toEqual([])
    expect(fake.calls.find((c) => c.operation === 'send_notification')).toBeUndefined()
  })

  it('skipped_by_limit is a clean no-op (per-Message dedupe, not a failure)', async () => {
    const skipped: ResourceOpResult<unknown> = {
      outcome: 'skipped_by_limit',
      limit_id: 3,
      scope: 'per_message' satisfies LimitScope,
    }
    const { runArgs } = args(skipped)
    const result = await runOperator(snapshot(), runArgs)
    // Run completes without throwing and emits no Tags.
    expect(result.tags).toEqual([])
  })

  it('failed result makes the run throw', async () => {
    const failed: ResourceOpResult<unknown> = {
      outcome: 'failed',
      error: new Error('pushover 500'),
    }
    const { runArgs } = args(failed)
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(NotifyError)
  })
})
