import { describe, expect, it } from 'vitest'
import { allCapabilities, capabilitiesFrom } from '../../providers/account-capabilities.js'
import type { MailboxClient, MessageView, OperatorRunInput, RunAccount } from '../types.js'
import { fileType } from './file.js'
import { setAsideType } from './set-aside.js'

const MESSAGE: MessageView = {
  id: 1,
  accountId: 1,
  backendMessageId: '<one@x>',
  from: 'Alice <alice@example.com>',
  from_email: 'alice@example.com',
  from_domain: 'example.com',
  to: 'me@example.com',
  subject: 'a receipt',
  snippet: null,
  bodyText: null,
  bodyHtml: null,
  receivedAt: 100,
  takenInAt: 100,
  headers: new Map(),
  thread: null,
}

interface Calls {
  categories: string[]
  folders: string[]
}

function mailbox(calls: Calls, outcome: 'succeeded' | 'skipped_by_limit' | 'failed' = 'succeeded'): MailboxClient {
  const result = <T>(value: T) =>
    outcome === 'succeeded' ? { outcome: 'succeeded' as const, value }
    : outcome === 'skipped_by_limit' ?
      { outcome: 'skipped_by_limit' as const, limit_id: 1, scope: 'per_window' as const }
    : { outcome: 'failed' as const, error: new Error('the server said no') }
  return {
    apply_category: (args) => {
      calls.categories.push(args.category)
      return Promise.resolve(result({ applied: true }))
    },
    file: (args) => {
      calls.folders.push(args.folder)
      return Promise.resolve(result({ filed: true }))
    },
    archive: () => Promise.reject(new Error('unused')),
    fetch_metadata: () => Promise.reject(new Error('unused')),
    fetch_body: () => Promise.reject(new Error('unused')),
    list_messages: () => Promise.reject(new Error('unused')),
  }
}

function setAsideInput(account: RunAccount | undefined, client: MailboxClient): OperatorRunInput<'set_aside'> {
  return {
    config: { category_template: 'later/{{subject}}', folder: 'Later' },
    message: MESSAGE,
    tags: new Map(),
    resources: { mailbox: client },
    signal: new AbortController().signal,
    account,
  }
}

describe('set_aside (r-blqzjemx, d-hj9nac5f)', () => {
  it('applies the category on an account that can categorize', async () => {
    const calls: Calls = { categories: [], folders: [] }
    await setAsideType.run(setAsideInput({ id: 1, capabilities: allCapabilities(0) }, mailbox(calls)))

    expect(calls.categories).toEqual(['later/a_receipt'])
    expect(calls.folders).toEqual([])
  })

  it('files on an account that cannot categorize but can file', async () => {
    const calls: Calls = { categories: [], folders: [] }
    const declared = capabilitiesFrom(['file', 'archive'], { apply_category: 'no keywords' }, 0)
    await setAsideType.run(setAsideInput({ id: 1, capabilities: declared }, mailbox(calls)))

    expect(calls.categories).toEqual([])
    expect(calls.folders).toEqual(['Later'])
  })

  it('fails on an account that can do neither', async () => {
    const calls: Calls = { categories: [], folders: [] }
    const declared = capabilitiesFrom([], { apply_category: 'no keywords', file: 'no safe move' }, 0)

    await expect(setAsideType.run(setAsideInput({ id: 1, capabilities: declared }, mailbox(calls)))).rejects.toThrow(
      /neither apply a category nor file/,
    )
    expect(calls).toEqual({ categories: [], folders: [] })
  })

  it('attempts the category on an account that has never polled (d-p9q9dxqn)', async () => {
    const calls: Calls = { categories: [], folders: [] }
    await setAsideType.run(setAsideInput({ id: 1, capabilities: null }, mailbox(calls)))

    expect(calls.categories).toEqual(['later/a_receipt'])
  })

  it('makes the rendered category carriable (d-mbh2pthe)', async () => {
    const calls: Calls = { categories: [], folders: [] }
    const input = setAsideInput({ id: 1, capabilities: allCapabilities(0) }, mailbox(calls))
    await setAsideType.run({ ...input, config: { ...input.config, category_template: '{{subject}}' } })

    expect(calls.categories).toEqual(['a_receipt'])
  })

  it('does not fire where the gate does not match', async () => {
    const calls: Calls = { categories: [], folders: [] }
    const input = setAsideInput({ id: 1, capabilities: allCapabilities(0) }, mailbox(calls))
    await setAsideType.run({
      ...input,
      config: { ...input.config, when: { tag_key: 'kind', equals: ['bill'] } },
      tags: new Map([['kind', 'newsletter']]),
    })

    expect(calls).toEqual({ categories: [], folders: [] })
  })

  it('treats a limit denial as an outcome rather than a failure', async () => {
    const calls: Calls = { categories: [], folders: [] }
    const declared = capabilitiesFrom(['file'], { apply_category: 'no keywords' }, 0)
    await expect(
      setAsideType.run(setAsideInput({ id: 1, capabilities: declared }, mailbox(calls, 'skipped_by_limit'))),
    ).resolves.toEqual({ tags: [] })
  })
})

describe('file (d-jj2mymbi)', () => {
  function fileInput(client: MailboxClient): OperatorRunInput<'file'> {
    return {
      config: { folder: 'Receipts' },
      message: MESSAGE,
      tags: new Map(),
      resources: { mailbox: client },
      signal: new AbortController().signal,
    }
  }

  it('files into the folder its own config names', async () => {
    const calls: Calls = { categories: [], folders: [] }
    await fileType.run(fileInput(mailbox(calls)))
    expect(calls.folders).toEqual(['Receipts'])
  })

  it('does not fire where the gate does not match', async () => {
    const calls: Calls = { categories: [], folders: [] }
    const input = fileInput(mailbox(calls))
    await fileType.run({
      ...input,
      config: { folder: 'Receipts', when: { tag_key: 'kind', equals: ['bill'] } },
      tags: new Map([['kind', 'newsletter']]),
    })
    expect(calls.folders).toEqual([])
  })

  it('fails the run where the call failed', async () => {
    const calls: Calls = { categories: [], folders: [] }
    await expect(fileType.run(fileInput(mailbox(calls, 'failed')))).rejects.toThrow(/file failed/)
  })

  it('takes a limit denial as a clean no-op', async () => {
    const calls: Calls = { categories: [], folders: [] }
    await expect(fileType.run(fileInput(mailbox(calls, 'skipped_by_limit')))).resolves.toEqual({ tags: [] })
  })

  it('declares mailbox.file and nothing else', () => {
    expect(fileType.contractFromConfig({ folder: 'Receipts' }).resources).toEqual([
      { resource: 'mailbox', operations: ['file'] },
    ])
  })
})
