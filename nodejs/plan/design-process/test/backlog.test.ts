import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  addItem,
  BACKLOG_BRANCH,
  deleteItems,
  formatItem,
  ITEM_ID,
  listItems,
  parseItem,
  readItem,
  searchItems,
  sendItems,
  updateItem,
} from '../src/backlog.js'

import { demoProduct, makeGitRepo, removeRepo } from './helpers.js'

import type { StoreOptions } from '../src/backlog.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.email=t@e.com', '-c', 'user.name=t', ...args], { encoding: 'utf8' })

const repo = (): StoreOptions => {
  const { root } = makeGitRepo(demoProduct())
  roots.push(root)
  return { root, offline: true, push: false }
}

/** A repo whose `origin` is a bare clone, so pushes have somewhere to go. */
const repoWithRemote = (): StoreOptions & { remotePath: string } => {
  const options = repo()
  const remotePath = mkdtempSync(join(tmpdir(), 'design-process-remote-'))
  roots.push(remotePath)
  execFileSync('git', ['init', '--bare', '-b', 'main', remotePath])
  git(options.root, 'remote', 'add', 'origin', remotePath)
  git(options.root, 'push', 'origin', 'main')
  return { ...options, push: true, offline: false, remotePath }
}

/** A second clone of the same remote, standing in for whoever else is writing the backlog. */
const rivalClone = (remotePath: string): StoreOptions => {
  const root = mkdtempSync(join(tmpdir(), 'design-process-rival-'))
  roots.push(root)
  execFileSync('git', ['clone', '--quiet', remotePath, root])
  return { root, push: true, offline: false }
}

describe('the item file — d-ubltnjpp', () => {
  it('reads the product and id from the path, and the title from the first heading', () => {
    const item = parseItem('demo/b-abcd1234.md', '# a braindump\n\nsome prose.\n')
    expect(item).toMatchObject({ product: 'demo', id: 'b-abcd1234', title: 'a braindump' })
    expect(item.tags).toEqual([])
  })

  it('reads tags from the frontmatter and carries nothing else across', () => {
    const item = parseItem('demo/b-abcd1234.md', '---\ntags:\n  - tooling\n  - later\nstray: 1\n---\n\n# t\n\nbody\n')
    expect(item.tags).toEqual(['tooling', 'later'])
    expect(item.content).toBe('# t\n\nbody\n')
    expect(Object.keys(item)).not.toContain('stray')
  })

  it('writes frontmatter only when the item carries tags', () => {
    expect(formatItem({ content: '# t\n' })).toBe('# t\n')
    expect(formatItem({ tags: [], content: '# t\n' })).toBe('# t\n')
    expect(formatItem({ tags: ['a'], content: '# t\n' })).toBe('---\ntags:\n  - a\n---\n\n# t\n')
  })

  it('refuses a path that is not <product>/<id>.md', () => {
    expect(() => parseItem('demo/notes.md', '# t\n')).toThrow(/<product>\/<id>\.md/)
  })
})

describe('add — r-9qhjtznd, r-oabwygl2, d-kfy1sexh', () => {
  it('mints a b- id of eight lowercase base36 characters', () => {
    const item = addItem(repo(), { product: 'demo', title: 'a thing' })
    expect(item.id).toMatch(ITEM_ID)
    expect(item.path).toBe(`demo/${item.id}.md`)
  })

  it('creates the backlog branch orphan, holding only backlog files', () => {
    const options = repo()
    const item = addItem(options, { product: 'demo', title: 'a thing' })
    expect(git(options.root, 'rev-list', '--count', BACKLOG_BRANCH).trim()).toBe('1')
    expect(git(options.root, 'ls-tree', '-r', '--name-only', BACKLOG_BRANCH).trim()).toBe(item.path)
    expect(() => git(options.root, 'merge-base', BACKLOG_BRANCH, 'main')).toThrow()
  })

  it('leaves the working tree and the checked-out branch alone', () => {
    const options = repo()
    addItem(options, { product: 'demo', title: 'a thing' })
    expect(git(options.root, 'status', '--porcelain').trim()).toBe('')
    expect(git(options.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
  })

  it('pushes the commit straight to the remote branch', () => {
    const options = repoWithRemote()
    const item = addItem(options, { product: 'demo', title: 'a thing' })
    expect(listItems({ ...options, offline: false })).toHaveLength(1)
    expect(git(options.root, 'ls-tree', '-r', '--name-only', `refs/remotes/origin/${BACKLOG_BRANCH}`).trim()).toBe(
      item.path,
    )
  })

  it('takes a free-prose body and heads it with the title', () => {
    const options = repo()
    const item = addItem(options, {
      product: 'demo',
      title: 'a braindump',
      body: 'one paragraph.\n\nand another, with no structure at all.\n',
    })
    expect(item.content).toBe('# a braindump\n\none paragraph.\n\nand another, with no structure at all.\n')
    expect(item.title).toBe('a braindump')
  })

  it('takes the title from a body that already leads with a heading', () => {
    const item = addItem(repo(), { product: 'demo', body: '# from the body\n\nprose.\n' })
    expect(item.title).toBe('from the body')
  })

  it('refuses a body with neither a title nor a heading', () => {
    expect(() => addItem(repo(), { product: 'demo', body: 'just prose' })).toThrow(/--title/)
  })

  it('refuses a title beside a leading heading', () => {
    expect(() => addItem(repo(), { product: 'demo', title: 'x', body: '# y\n' })).toThrow(/already begins/)
  })
})

describe('list and search — r-9qhjtznd, r-oabwygl2', () => {
  const seeded = (): { options: StoreOptions; ids: string[] } => {
    const options = repo()
    const ids = [
      addItem(options, { product: 'demo', title: 'tag the backlog', tags: ['tooling'] }).id,
      addItem(options, { product: 'demo', title: 'a second thought', tags: ['tooling', 'later'] }).id,
      addItem(options, { product: 'other', title: 'unrelated', body: 'mentions the backlog once' }).id,
    ]
    return { options, ids }
  }

  it('carries the product association on every listed item', () => {
    const { options } = seeded()
    expect(listItems(options).map((item) => item.product)).toEqual(['demo', 'demo', 'other'])
  })

  it('filters by product', () => {
    const { options } = seeded()
    expect(listItems(options, { product: 'demo' })).toHaveLength(2)
  })

  it('filters by tag, requiring every tag named', () => {
    const { options } = seeded()
    expect(listItems(options, { tags: ['tooling'] })).toHaveLength(2)
    expect(listItems(options, { tags: ['tooling', 'later'] })).toHaveLength(1)
    expect(listItems(options, { tags: ['absent'] })).toHaveLength(0)
  })

  it('searches ids, titles, and bodies case-insensitively, and keeps the product', () => {
    const { options } = seeded()
    const hits = searchItems(options, 'BACKLOG')
    expect(hits.map((item) => item.title)).toEqual(['tag the backlog', 'unrelated'])
    expect(hits.map((item) => item.product)).toEqual(['demo', 'other'])
    expect(searchItems(options, 'backlog', { product: 'demo' })).toHaveLength(1)
  })

  it('reads one item back by id', () => {
    const { options, ids } = seeded()
    expect(readItem(options, ids[0]).title).toBe('tag the backlog')
    expect(() => readItem(options, 'b-00000000')).toThrow(/no backlog item/)
  })

  it('is empty before anything is captured', () => {
    expect(listItems(repo())).toEqual([])
  })
})

describe('update — r-9qhjtznd', () => {
  it('replaces the title in place, keeping the body', () => {
    const options = repo()
    const { id } = addItem(options, { product: 'demo', title: 'old', body: 'prose stays.' })
    const updated = updateItem(options, id, { title: 'new' })
    expect(updated.title).toBe('new')
    expect(updated.content).toBe('# new\n\nprose stays.\n')
  })

  it('replaces, adds, and removes tags', () => {
    const options = repo()
    const { id } = addItem(options, { product: 'demo', title: 't', tags: ['a', 'b'] })
    expect(updateItem(options, id, { tags: ['c'] }).tags).toEqual(['c'])
    expect(updateItem(options, id, { addTags: ['d'] }).tags).toEqual(['c', 'd'])
    expect(updateItem(options, id, { removeTags: ['c'] }).tags).toEqual(['d'])
  })

  it('moves the item to another product, keeping its id', () => {
    const options = repo()
    const { id } = addItem(options, { product: 'demo', title: 't' })
    const moved = updateItem(options, id, { product: 'other' })
    expect(moved).toMatchObject({ id, product: 'other', path: `other/${id}.md` })
    expect(listItems(options)).toHaveLength(1)
  })

  it('replaces the body', () => {
    const options = repo()
    const { id } = addItem(options, { product: 'demo', title: 't', body: 'first' })
    expect(updateItem(options, id, { body: '# t\n\nsecond' }).content).toBe('# t\n\nsecond\n')
  })
})

describe('delete — r-9qhjtznd', () => {
  it('drops items in one commit and refuses an unknown id', () => {
    const options = repo()
    const first = addItem(options, { product: 'demo', title: 'one' }).id
    const second = addItem(options, { product: 'demo', title: 'two' }).id
    const before = Number(git(options.root, 'rev-list', '--count', BACKLOG_BRANCH).trim())
    deleteItems(options, [first, second])
    expect(listItems(options)).toEqual([])
    expect(Number(git(options.root, 'rev-list', '--count', BACKLOG_BRANCH).trim())).toBe(before + 1)
    expect(() => deleteItems(options, ['b-00000000'])).toThrow(/no backlog item/)
  })

  it('keeps the departed item in the branch history', () => {
    const options = repo()
    const item = addItem(options, { product: 'demo', title: 'gone' })
    deleteItems(options, [item.id])
    expect(git(options.root, 'show', `${BACKLOG_BRANCH}~1:${item.path}`)).toContain('# gone')
  })
})

describe('send to capture — r-9qhjtznd, d-wpih0mc1', () => {
  const seeded = (): { options: StoreOptions; ids: string[] } => {
    const options = repo()
    const ids = [
      addItem(options, { product: 'demo', title: 'first', tags: ['now'] }).id,
      addItem(options, { product: 'demo', title: 'second', tags: ['now', 'later'] }).id,
      addItem(options, { product: 'other', title: 'third' }).id,
    ]
    return { options, ids }
  }

  const target = 'products/demo/increments/wip-001-parallel-planning'

  it("copies one item into the increment's drafts and drains it in the same action", () => {
    const { options, ids } = seeded()
    const sent = sendItems(options, target, { ids: [ids[0]] })
    expect(sent).toHaveLength(1)
    expect(sent[0].path).toBe(`${target}/drafts/backlog/${ids[0]}.md`)
    expect(readFileSync(join(options.root, sent[0].path), 'utf8')).toContain('# first')
    expect(listItems(options).map((item) => item.id)).not.toContain(ids[0])
    expect(listItems(options)).toHaveLength(2)
  })

  it("sends all of a product's items", () => {
    const { options } = seeded()
    expect(sendItems(options, target, { product: 'demo' })).toHaveLength(2)
    expect(listItems(options).map((item) => item.product)).toEqual(['other'])
  })

  it('sends those matching a tag filter', () => {
    const { options } = seeded()
    const sent = sendItems(options, target, { tags: ['later'] })
    expect(sent.map((entry) => entry.item.title)).toEqual(['second'])
    expect(listItems(options)).toHaveLength(2)
  })

  it("targets a numbered increment as readily as a draft increment's wip directory", () => {
    const { options, ids } = seeded()
    const sent = sendItems(options, 'products/demo/increments/003', { ids: [ids[2]] })
    expect(existsSync(join(options.root, sent[0].path))).toBe(true)
  })

  it('refuses a target that is not an increment directory', () => {
    const { options, ids } = seeded()
    expect(() => sendItems(options, 'products/demo', { ids: [ids[0]] })).toThrow(/increments/)
  })

  it('refuses to run with no selector', () => {
    const { options } = seeded()
    expect(() => sendItems(options, target, {})).toThrow(/--item, --product, or --tag/)
  })
})

describe('a concurrent write — d-5pzfayi8', () => {
  /** Alice's local view of the branch, one commit behind what Bob has already pushed. */
  const staleAgainstRival = (): { alice: StoreOptions; rivalTitle: string } => {
    const alice = repoWithRemote()
    addItem(alice, { product: 'demo', title: 'alice first' })
    addItem(rivalClone(alice.remotePath), { product: 'demo', title: 'bob' })
    return { alice: { ...alice, offline: true }, rivalTitle: 'bob' }
  }

  it('rebuilds on the commit that beat it, keeping both items', () => {
    const { alice } = staleAgainstRival()
    const added = addItem(alice, { product: 'demo', title: 'alice second' })
    const titles = listItems({ ...alice, offline: false }).map((item) => item.title)
    expect(titles.sort()).toEqual(['alice first', 'alice second', 'bob'])
    expect(titles).toContain(added.title)
  })

  it('leaves the branch where it was when the retries run out', () => {
    const { alice } = staleAgainstRival()
    const before = git(alice.root, 'rev-parse', `refs/heads/${BACKLOG_BRANCH}`).trim()
    expect(() => addItem({ ...alice, retries: 0 }, { product: 'demo', title: 'alice second' })).toThrow(
      /moved under this change/,
    )
    expect(git(alice.root, 'rev-parse', `refs/heads/${BACKLOG_BRANCH}`).trim()).toBe(before)
  })
})
