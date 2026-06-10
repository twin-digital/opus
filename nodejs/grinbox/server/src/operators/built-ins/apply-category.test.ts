import type { LimitScope, ResourceOpResult } from '@twin-digital/grinbox-shared'
import { describe, expect, it } from 'vitest'
import { runOperator } from '../run.js'
import { createFakeResourceClients } from '../testing.js'
import type { MessageView } from '../types.js'
import { ApplyCategoryError } from './apply-category.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'gmail-abc',
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

interface ApplyCategoryConfigShape {
  category_template: string
  when?: { tag_key: string; equals: [string, ...string[]] }
}

const CONFIG: ApplyCategoryConfigShape = {
  category_template: 'Grinbox/{{tag.topic}}',
}

function snapshot(configOver: Partial<ApplyCategoryConfigShape> = {}) {
  return {
    type_key: 'apply_category',
    type_code_version: '1',
    op_config_json: JSON.stringify({ ...CONFIG, ...configOver }),
  }
}

function args(canned: ResourceOpResult<unknown> | undefined, tags: Record<string, string> = {}) {
  const fake = createFakeResourceClients(canned ? { canned: { 'gmail_api.apply_label': canned } } : {})
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

function labelApplied(): ResourceOpResult<unknown> {
  return { outcome: 'succeeded', value: { applied: true } }
}

describe('apply-category run', () => {
  it('applies the templated category (renders Tags, passes backend id)', async () => {
    const { fake, runArgs } = args(labelApplied(), { topic: 'Finance' })
    const result = await runOperator(snapshot(), runArgs)

    expect(result.tags).toEqual([])
    const call = fake.calls.find((c) => c.operation === 'apply_label')
    expect(call).toBeDefined()
    const sent = call?.args as { backendMessageId: string; label: string }
    expect(sent.backendMessageId).toBe('gmail-abc')
    expect(sent.label).toBe('Grinbox/Finance')
  })

  it('clean no-op when the optional `when` gate does not match', async () => {
    const { fake, runArgs } = args(labelApplied(), { topic: 'Finance' })
    const result = await runOperator(snapshot({ when: { tag_key: 'topic', equals: ['Travel'] } }), runArgs)
    expect(result.tags).toEqual([])
    expect(fake.calls.find((c) => c.operation === 'apply_label')).toBeUndefined()
  })

  it('fires when the optional `when` gate matches', async () => {
    const { fake, runArgs } = args(labelApplied(), { topic: 'Travel' })
    await runOperator(snapshot({ when: { tag_key: 'topic', equals: ['Travel'] } }), runArgs)
    expect(fake.calls.find((c) => c.operation === 'apply_label')).toBeDefined()
  })

  it('skipped_by_limit is a clean no-op (not a failure)', async () => {
    const skipped: ResourceOpResult<unknown> = {
      outcome: 'skipped_by_limit',
      limit_id: 9,
      scope: 'per_message' satisfies LimitScope,
    }
    const { runArgs } = args(skipped, { topic: 'Finance' })
    const result = await runOperator(snapshot(), runArgs)
    expect(result.tags).toEqual([])
  })

  it('failed result makes the run throw', async () => {
    const failed: ResourceOpResult<unknown> = {
      outcome: 'failed',
      error: new Error('gmail 500'),
    }
    const { runArgs } = args(failed, { topic: 'Finance' })
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(ApplyCategoryError)
  })
})
