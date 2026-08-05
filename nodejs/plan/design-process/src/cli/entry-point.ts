import { readFileSync } from 'node:fs'

import { Command, Option } from 'commander'

import { addItem, deleteItems, listItems, readItem, searchItems, sendItems, updateItem } from '../backlog.js'
import { findLandingConflicts } from '../conflicts.js'
import { diffFolds, renderFoldDiff } from '../diff.js'
import { generateIds, collectIds } from '../ids.js'
import { landIncrement, landingBlockers } from '../land.js'
import { projectProduct } from '../project.js'
import { runIncrementSession } from '../session/run.js'
import { readSecret } from '../session/secret.js'
import { DirTree, GitTree, resolveGitRef } from '../tree.js'
import { validateTree } from '../validate.js'
import { formatIncrement, parseFoldVersion, resolveFold } from '../version.js'

import type { StoreOptions } from '../backlog-store.js'
import type { BacklogItem } from '../backlog.js'
import type { IdKind } from '../ids.js'
import type { Finding } from '../types.js'

const program = new Command()

program
  .name('design-process')
  .description('Validator, projection, backlog, and fold tools for the incremental design process.')

const rootOption = (command: Command): Command => command.option('--root <dir>', 'repository root', '.')

program
  .command('check')
  .description('apply every design rule in force; any finding blocks the merge')
  .option('--root <dir>', 'repository root', '.')
  .option('--base <ref>', 'git ref the change rules compare against (default: origin/main, then main)')
  .option('--static-only', 'skip the change rules that need a base ref', false)
  .action((options: { root: string; base?: string; staticOnly: boolean }) => {
    const head = new DirTree(options.root)
    let base: GitTree | undefined
    if (!options.staticOnly) {
      const ref = options.base ?? resolveGitRef(options.root, ['origin/main', 'main'])
      if (ref === undefined) {
        process.stderr.write('design-process: no base ref resolvable; running tree-state rules only\n')
      } else {
        base = new GitTree(options.root, ref)
      }
    }
    const findings = validateTree(head, { base })
    if (findings.length === 0) {
      process.stdout.write('design check passed\n')
      return
    }
    for (const finding of findings) {
      process.stdout.write(formatFinding(finding))
    }
    process.stdout.write(`design check failed: ${findings.length} finding(s)\n`)
    process.exitCode = 1
  })

program
  .command('show')
  .description('render the folded, effective state of a product at a fold version')
  .argument('<product>', 'product id (the products/<id> directory name)')
  .option('--root <dir>', 'repository root', '.')
  .option('--at <increment>', "fold at this increment number, padded or not (default: the working tree's newest)")
  .option('--at-ref <gitref>', "fold at this git ref's newest increment")
  .option('--facet <facet>', 'show only claims carrying this facet')
  .action((productId: string, options: { root: string; at?: string; atRef?: string; facet?: string }) => {
    const version = parseFoldVersion({ increment: options.at, ref: options.atRef, names: ['--at', '--at-ref'] })
    const resolved = resolveFold(options.root, productId, version)
    // with no version asked for, the projection reads the tree as it stands — drafts included
    const at = version === undefined ? undefined : resolved.at
    process.stdout.write(projectProduct(resolved.tree, productId, { at, facet: options.facet }))
  })

program
  .command('id')
  .description('generate opaque ids, unique against everything under products/')
  .argument('<kind>', 'r (requirement), d (decision), or q (question)')
  .option('--root <dir>', 'repository root', '.')
  .option('--count <n>', 'how many ids to generate', '1')
  .action((kind: string, options: { root: string; count: string }) => {
    if (kind !== 'r' && kind !== 'd' && kind !== 'q') {
      program.error(`kind must be r, d, or q; got ${JSON.stringify(kind)}`)
    }
    const taken = collectIds(new DirTree(options.root))
    for (const id of generateIds(kind as IdKind, Number(options.count), taken)) {
      process.stdout.write(`${id}\n`)
    }
  })

program
  .command('where')
  .description("name a product's latest published increment at a fold version")
  .argument('<product>', 'product id')
  .option('--root <dir>', 'repository root', '.')
  .option('--at <increment>', 'report at this increment number, padded or not (default: the working tree)')
  .option('--at-ref <gitref>', 'report the newest increment published at this git ref')
  .option('--next', 'print the number a landing would claim instead', false)
  .action((productId: string, options: { root: string; at?: string; atRef?: string; next: boolean }) => {
    const version = parseFoldVersion({ increment: options.at, ref: options.atRef, names: ['--at', '--at-ref'] })
    const resolved = resolveFold(options.root, productId, version)
    if (options.next) {
      process.stdout.write(`${formatIncrement(resolved.at + 1)}\n`)
      return
    }
    if (resolved.at === 0) {
      process.stderr.write(`design-process: ${productId} has published no increment there\n`)
      process.exitCode = 1
      return
    }
    process.stdout.write(`${formatIncrement(resolved.at)}\n`)
  })

program
  .command('diff')
  .description("report what changed between two versions of a product's fold")
  .argument('<product>', 'product id')
  .option('--from <increment>', 'the earlier fold, at this increment number, padded or not')
  .option('--from-ref <gitref>', "the earlier fold, at this git ref's newest increment")
  .option('--to <increment>', 'the later fold, at this increment number (default: the working tree)')
  .option('--to-ref <gitref>', "the later fold, at this git ref's newest increment")
  .option('--root <dir>', 'repository root', '.')
  .option('--json', 'emit the delta as JSON', false)
  .action(
    (
      productId: string,
      options: { root: string; from?: string; fromRef?: string; to?: string; toRef?: string; json: boolean },
    ) => {
      const fromVersion = parseFoldVersion({
        increment: options.from,
        ref: options.fromRef,
        names: ['--from', '--from-ref'],
      })
      if (fromVersion === undefined) {
        program.error('design-process: diff needs an earlier fold; pass --from or --from-ref')
        return
      }
      const from = resolveFold(options.root, productId, fromVersion)
      const to = resolveFold(
        options.root,
        productId,
        parseFoldVersion({ increment: options.to, ref: options.toRef, names: ['--to', '--to-ref'] }),
      )
      const delta = diffFolds(productId, from.fold, to.fold)
      process.stdout.write(options.json ? `${JSON.stringify(delta, undefined, 2)}\n` : renderFoldDiff(delta))
    },
  )

program
  .command('conflicts')
  .description("check a draft's rulings against the fold at head before it lands")
  .argument('<product>', 'product id')
  .option('--root <dir>', 'repository root', '.')
  .option('--against <increment>', 'check against this increment number, padded or not')
  .option('--against-ref <gitref>', "check against this git ref's fold (default: origin/main, then main)")
  .action((productId: string, options: { root: string; against?: string; againstRef?: string }) => {
    let version = parseFoldVersion({
      increment: options.against,
      ref: options.againstRef,
      names: ['--against', '--against-ref'],
    })
    if (version === undefined) {
      const ref = resolveGitRef(options.root, ['origin/main', 'main'])
      if (ref === undefined) {
        program.error('design-process: no head resolvable; pass --against or --against-ref')
        return
      }
      version = { kind: 'ref', ref }
    }
    const head = resolveFold(options.root, productId, version)
    const findings = findLandingConflicts(new DirTree(options.root), head, productId)
    if (findings.length === 0) {
      process.stdout.write(`landing check passed: no conflicts against ${formatIncrement(head.at)}\n`)
      return
    }
    for (const finding of findings) {
      process.stdout.write(formatFinding(finding))
    }
    process.stdout.write(`landing check failed: ${findings.length} conflict(s)\n`)
    process.exitCode = 1
  })

program
  .command('increment')
  .description("rule a draft's open entries and land it, in one full-screen session")
  .argument('<product>', 'product id')
  .option('--root <dir>', 'repository root', '.')
  .action(async (productId: string, options: { root: string }) => {
    process.exitCode = await runIncrementSession({ root: options.root, product: productId })
  })

program
  .command('land')
  .description('run the landing sequence over the draft the working tree holds, without a session')
  .argument('<product>', 'product id')
  .option('--root <dir>', 'repository root', '.')
  .action(async (productId: string, options: { root: string }) => {
    const blockers = landingBlockers(new DirTree(options.root), productId)
    if (blockers.length > 0) {
      for (const blocker of blockers) {
        process.stderr.write(`design-process: ${blocker}\n`)
      }
      process.stderr.write('design-process: the draft is unsettled; nothing was published\n')
      process.exitCode = 1
      return
    }
    const result = await landIncrement({
      root: options.root,
      product: productId,
      approvingToken: () => readSecret({ prompt: "the owner's approving token: " }).then((token) => token || undefined),
    })
    for (const step of result.steps) {
      const mark =
        step.status === 'ok' ? '✔'
        : step.status === 'skipped' ? '·'
        : '✖'
      process.stdout.write(`${mark} ${step.step}${step.detail === undefined ? '' : `: ${step.detail}`}\n`)
    }
    if (!result.landed) {
      process.exitCode = 1
      return
    }
    process.stdout.write(`landed as ${result.number}\n`)
    if (result.awaitingApproval === true) {
      process.stdout.write("the pull request awaits the owner's approval\n")
    }
    if (result.awaitingMerge === true) {
      process.stdout.write('the pull request is approved and awaits a manual merge\n')
    }
  })

const backlog = program.command('backlog').description('the cross-increment backlog, on the orphan `backlog` branch')

const storeOptions = (command: Command): Command =>
  rootOption(command)
    .option('--remote <name>', 'the remote the branch lives on', 'origin')
    .option('--offline', 'skip the fetch that refreshes the local view', false)

const writeOptions = (command: Command): Command =>
  storeOptions(command).option('--no-push', 'commit locally without pushing to the remote')

interface StoreFlags {
  root: string
  remote: string
  offline: boolean
  push?: boolean
}

const store = (options: StoreFlags): StoreOptions => ({
  root: options.root,
  remote: options.remote,
  offline: options.offline,
  push: options.push,
})

const readBody = (file?: string): string | undefined => {
  if (file !== undefined) {
    return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8')
  }
  return process.stdin.isTTY ? undefined : readFileSync(0, 'utf8')
}

const collect = (value: string, previous: string[]): string[] => [...previous, value]

writeOptions(backlog.command('add'))
  .description('capture an item; the body comes from stdin or --file')
  .argument('<product>', 'the product the item belongs to')
  .option('--title <text>', 'the item title, written as the first heading')
  .option('--tag <tag>', 'a tag, repeatable', collect, [])
  .option('--file <path>', 'read the body from this file, or - for stdin')
  .action((product: string, options: StoreFlags & { title?: string; tag: string[]; file?: string }) => {
    const body = options.title !== undefined && options.file === undefined ? readBody() : readBody(options.file ?? '-')
    const item = addItem(store(options), { product, title: options.title, tags: options.tag, body })
    process.stdout.write(`${item.id}\n`)
  })

storeOptions(backlog.command('list'))
  .description('list what the backlog holds')
  .option('--product <id>', 'only this product')
  .option('--tag <tag>', 'only items carrying this tag, repeatable', collect, [])
  .option('--json', 'emit the items as JSON', false)
  .action((options: StoreFlags & { product?: string; tag: string[]; json: boolean }) => {
    emit(listItems(store(options), { product: options.product, tags: options.tag }), options.json)
  })

storeOptions(backlog.command('search'))
  .description('search item ids, titles, and bodies, case-insensitively')
  .argument('<query>', 'substring to look for')
  .option('--product <id>', 'only this product')
  .option('--tag <tag>', 'only items carrying this tag, repeatable', collect, [])
  .option('--json', 'emit the items as JSON', false)
  .action((query: string, options: StoreFlags & { product?: string; tag: string[]; json: boolean }) => {
    emit(searchItems(store(options), query, { product: options.product, tags: options.tag }), options.json)
  })

storeOptions(backlog.command('show'))
  .description("print one item's markdown")
  .argument('<id>', 'the item id')
  .action((id: string, options: StoreFlags) => {
    process.stdout.write(readItem(store(options), id).content)
  })

writeOptions(backlog.command('update'))
  .description('revise an item')
  .argument('<id>', 'the item id')
  .option('--title <text>', 'replace the title')
  .option('--tag <tag>', 'replace the tag set, repeatable', collect, [])
  .option('--add-tag <tag>', 'add a tag, repeatable', collect, [])
  .option('--remove-tag <tag>', 'remove a tag, repeatable', collect, [])
  .option('--file <path>', 'replace the body from this file, or - for stdin')
  .option('--product <id>', 'move the item to another product')
  .action(
    (
      id: string,
      options: StoreFlags & {
        title?: string
        tag: string[]
        addTag: string[]
        removeTag: string[]
        file?: string
        product?: string
      },
    ) => {
      updateItem(store(options), id, {
        title: options.title,
        tags: options.tag.length > 0 ? options.tag : undefined,
        addTags: options.addTag,
        removeTags: options.removeTag,
        body: options.file === undefined ? undefined : readBody(options.file),
        product: options.product,
      })
    },
  )

writeOptions(backlog.command('delete'))
  .description('drop items from the backlog')
  .argument('<id...>', 'the item ids')
  .action((ids: string[], options: StoreFlags) => {
    deleteItems(store(options), ids)
  })

writeOptions(backlog.command('send'))
  .description("copy items into an increment's drafts and drain them from the backlog")
  .argument('<increment-dir>', 'products/<product>/increments/<name> — a slug-named draft or a numbered increment')
  .addOption(new Option('--item <id>', 'send this item, repeatable').argParser(collect).default([]))
  .option('--product <id>', "send all of a product's items")
  .option('--tag <tag>', 'send items carrying this tag, repeatable', collect, [])
  .action((incrementDir: string, options: StoreFlags & { item: string[]; product?: string; tag: string[] }) => {
    const sent = sendItems(store(options), incrementDir, {
      ids: options.item.length > 0 ? options.item : undefined,
      product: options.product,
      tags: options.tag,
    })
    for (const entry of sent) {
      process.stdout.write(`${entry.item.id}\t${entry.path}\n`)
    }
  })

const emit = (items: BacklogItem[], json: boolean): void => {
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        items.map(({ id, product, title, tags }) => ({ id, product, title, tags })),
        undefined,
        2,
      )}\n`,
    )
    return
  }
  if (items.length === 0) {
    process.stderr.write('design-process: no matching backlog items\n')
    return
  }
  const productWidth = Math.max(...items.map((item) => item.product.length))
  const titleWidth = Math.max(...items.map((item) => (item.title || '(untitled)').length))
  for (const item of items) {
    const columns = [
      item.id,
      item.product.padEnd(productWidth),
      (item.title || '(untitled)').padEnd(item.tags.length > 0 ? titleWidth : 0),
      item.tags.join(', '),
    ]
    process.stdout.write(`${columns.join('  ').trimEnd()}\n`)
  }
}

const formatFinding = (finding: Finding): string => {
  const location = finding.path === undefined ? '' : `${finding.path}: `
  return `✖ [${finding.rule}] ${location}${finding.message} (${finding.claims.join(', ')})\n`
}

try {
  program.parse()
} catch (error) {
  if (error instanceof Error && 'code' in error && String(error.code).startsWith('commander.')) {
    throw error
  }
  process.stderr.write(`design-process: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
