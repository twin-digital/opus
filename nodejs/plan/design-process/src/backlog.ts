import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse, stringify } from 'yaml'

import { readStore, writeStore } from './backlog-store.js'
import { generateIds } from './ids.js'

import type { StoreOptions } from './backlog-store.js'

export { BACKLOG_BRANCH } from './backlog-store.js'
export type { StoreOptions } from './backlog-store.js'

export const ITEM_ID = /^b-[0-9a-z]{8}$/
const ITEM_PATH = /^([^/]+)\/(b-[0-9a-z]{8})\.md$/
const INCREMENT_DIR = /^products\/[^/]+\/increments\/[^/]+$/
const HEADING = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

/** Where a sent item's content lands inside the adopting increment. */
export const DRAFTS_SUBDIR = 'drafts/backlog'

export interface BacklogItem {
  id: string
  product: string
  /** `<product>/<id>.md`, the path on the backlog branch. */
  path: string
  /** The first heading in the content; empty when the content carries none. */
  title: string
  tags: string[]
  /** The markdown after the frontmatter, heading included. */
  content: string
}

export interface ItemFilter {
  product?: string
  /** An item matches when it carries every tag named. */
  tags?: string[]
  ids?: string[]
}

export const parseItem = (path: string, source: string): BacklogItem => {
  const match = ITEM_PATH.exec(path)
  if (!match) {
    throw new Error(`${path} is not <product>/<id>.md`)
  }
  const [, product, id] = match as unknown as [string, string, string]
  const frontmatter = FRONTMATTER.exec(source)
  let tags: string[] = []
  if (frontmatter) {
    const data = parse(frontmatter[1]) as { tags?: unknown } | null
    if (Array.isArray(data?.tags)) {
      tags = data.tags.map((tag) => String(tag))
    }
  }
  const content = (frontmatter ? source.slice(frontmatter[0].length) : source).replace(/^\s*\n/, '')
  return { id, product, path, title: HEADING.exec(content)?.[1] ?? '', tags, content }
}

/** The file an item is stored as: frontmatter only when it carries tags. */
export const formatItem = (item: { tags?: string[]; content: string }): string => {
  const body = `${item.content.trimEnd()}\n`
  if (item.tags === undefined || item.tags.length === 0) {
    return body
  }
  return `---\n${stringify({ tags: item.tags })}---\n\n${body}`
}

const matches = (item: BacklogItem, filter: ItemFilter | undefined): boolean => {
  if (filter === undefined) {
    return true
  }
  if (filter.product !== undefined && item.product !== filter.product) {
    return false
  }
  if (filter.ids !== undefined && !filter.ids.includes(item.id)) {
    return false
  }
  return (filter.tags ?? []).every((tag) => item.tags.includes(tag))
}

const byProductThenId = (a: BacklogItem, b: BacklogItem): number =>
  a.product.localeCompare(b.product) || a.id.localeCompare(b.id)

const allItems = (files: Map<string, string>): BacklogItem[] => {
  const items: BacklogItem[] = []
  for (const [path, source] of files) {
    if (ITEM_PATH.test(path)) {
      items.push(parseItem(path, source))
    }
  }
  return items.sort(byProductThenId)
}

export const listItems = (options: StoreOptions, filter?: ItemFilter): BacklogItem[] =>
  allItems(readStore(options)).filter((item) => matches(item, filter))

/** Case-insensitive substring search over an item's id, title, and body. */
export const searchItems = (options: StoreOptions, query: string, filter?: ItemFilter): BacklogItem[] => {
  const needle = query.toLowerCase()
  return listItems(options, filter).filter((item) =>
    `${item.id}\n${item.title}\n${item.content}`.toLowerCase().includes(needle),
  )
}

export const readItem = (options: StoreOptions, id: string): BacklogItem => {
  const item = allItems(readStore(options)).find((candidate) => candidate.id === id)
  if (item === undefined) {
    throw new Error(`no backlog item ${JSON.stringify(id)}`)
  }
  return item
}

export interface NewItem {
  product: string
  title?: string
  tags?: string[]
  /** Free markdown. When it carries no heading, `title` supplies one. */
  body?: string
}

const composeContent = (input: NewItem): string => {
  const body = (input.body ?? '').trim()
  const heading = HEADING.exec(body)
  const leads = heading !== null && body.startsWith(heading[0])
  if (input.title === undefined) {
    if (!leads) {
      throw new Error('give --title, or begin the item with a markdown heading')
    }
    return body
  }
  if (leads) {
    throw new Error('the item already begins with a heading; drop --title or the heading')
  }
  return body.length === 0 ? `# ${input.title}` : `# ${input.title}\n\n${body}`
}

export const addItem = (options: StoreOptions, input: NewItem): BacklogItem => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.product)) {
    throw new Error(`${JSON.stringify(input.product)} is not a product id`)
  }
  const content = composeContent(input)
  const files = readStore(options)
  const taken = new Set([...files.keys()].flatMap((path) => ITEM_PATH.exec(path)?.[2] ?? []))
  const id = generateIds('b', 1, taken)[0]
  const path = `${input.product}/${id}.md`
  const item = parseItem(path, formatItem({ tags: input.tags ?? [], content }))
  files.set(path, formatItem(item))
  writeStore(options, files, `backlog: add ${id} — ${item.title}`)
  return item
}

export interface ItemPatch {
  title?: string
  /** Replaces the tag set outright. */
  tags?: string[]
  addTags?: string[]
  removeTags?: string[]
  /** Replaces the body; the title survives unless `title` also changes it. */
  body?: string
  /** Moves the item to another product, keeping its id. */
  product?: string
}

export const updateItem = (options: StoreOptions, id: string, patch: ItemPatch): BacklogItem => {
  const files = readStore(options)
  const current = allItems(files).find((candidate) => candidate.id === id)
  if (current === undefined) {
    throw new Error(`no backlog item ${JSON.stringify(id)}`)
  }

  let content = patch.body === undefined ? current.content : patch.body.trim()
  if (patch.title !== undefined) {
    const heading = HEADING.exec(content)
    content =
      heading && content.startsWith(heading[0]) ?
        `# ${patch.title}${content.slice(heading[0].length)}`
      : `# ${patch.title}${content.length === 0 ? '' : `\n\n${content}`}`
  }

  let tags = patch.tags ?? current.tags
  tags = [...tags, ...(patch.addTags ?? [])].filter((tag) => !(patch.removeTags ?? []).includes(tag))
  tags = [...new Set(tags)]

  const product = patch.product ?? current.product
  const path = `${product}/${id}.md`
  files.delete(current.path)
  const item = parseItem(path, formatItem({ tags, content }))
  files.set(path, formatItem(item))
  writeStore(options, files, `backlog: update ${id} — ${item.title}`)
  return item
}

export const deleteItems = (options: StoreOptions, ids: string[]): BacklogItem[] => {
  const files = readStore(options)
  const items = allItems(files).filter((item) => ids.includes(item.id))
  const missing = ids.filter((id) => !items.some((item) => item.id === id))
  if (missing.length > 0) {
    throw new Error(`no backlog item ${missing.map((id) => JSON.stringify(id)).join(', ')}`)
  }
  for (const item of items) {
    files.delete(item.path)
  }
  writeStore(options, files, describeDrain('delete', items))
  return items
}

export interface SentItem {
  item: BacklogItem
  /** Repo-relative path the content was written to. */
  path: string
}

/**
 * Copy the selected items into an increment's working drafts and delete them from the branch in
 * the same action. `incrementDir` is a repo-relative `products/<product>/increments/<name>` —
 * a slug-named draft directory as readily as a numbered one.
 */
export const sendItems = (options: StoreOptions, incrementDir: string, filter: ItemFilter): SentItem[] => {
  const dir = incrementDir.replace(/\/+$/, '')
  if (!INCREMENT_DIR.test(dir)) {
    throw new Error(`${JSON.stringify(incrementDir)} is not products/<product>/increments/<name>`)
  }
  if (filter.ids === undefined && filter.product === undefined && (filter.tags ?? []).length === 0) {
    throw new Error('select what to send: --item, --product, or --tag')
  }
  const files = readStore(options)
  const items = allItems(files).filter((item) => matches(item, filter))
  if (filter.ids !== undefined) {
    const missing = filter.ids.filter((id) => !items.some((item) => item.id === id))
    if (missing.length > 0) {
      throw new Error(`no backlog item ${missing.map((id) => JSON.stringify(id)).join(', ')}`)
    }
  }
  if (items.length === 0) {
    return []
  }

  const sent: SentItem[] = []
  for (const item of items) {
    const path = `${dir}/${DRAFTS_SUBDIR}/${item.id}.md`
    const absolute = join(options.root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, formatItem(item))
    files.delete(item.path)
    sent.push({ item, path })
  }
  writeStore(options, files, describeDrain(`send to ${dir}`, items))
  return sent
}

const describeDrain = (verb: string, items: BacklogItem[]): string =>
  items.length === 1 ?
    `backlog: ${verb} ${items[0].id} — ${items[0].title}`
  : `backlog: ${verb} ${items.length} items\n\n${items.map((item) => `- ${item.id} — ${item.title}`).join('\n')}\n`
