import { Command } from 'commander'

import { generateIds, collectIds } from '../ids.js'
import { projectProduct } from '../project.js'
import { DirTree, GitTree, resolveGitRef } from '../tree.js'
import { validateTree } from '../validate.js'

import type { IdKind } from '../ids.js'
import type { Finding } from '../types.js'

const program = new Command()

program
  .name('design-process')
  .description('Validator, projection, and id generator for the incremental design process.')

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
  .command('project')
  .description('render the folded, effective state of a product at an increment')
  .argument('<product>', 'product id (the products/<id> directory name)')
  .option('--root <dir>', 'repository root', '.')
  .option('--at <increment>', 'increment number to fold at (default: newest)')
  .option('--facet <facet>', 'show only claims carrying this facet')
  .action((productId: string, options: { root: string; at?: string; facet?: string }) => {
    process.stdout.write(
      projectProduct(new DirTree(options.root), productId, {
        at: options.at === undefined ? undefined : Number(options.at),
        facet: options.facet,
      }),
    )
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

const formatFinding = (finding: Finding): string => {
  const location = finding.path === undefined ? '' : `${finding.path}: `
  return `✖ [${finding.rule}] ${location}${finding.message} (${finding.claims.join(', ')})\n`
}

program.parse()
