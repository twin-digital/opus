#!/usr/bin/env node
// repo-kit CLI launcher.
//
// In-repo, the TypeScript source sits next to this file, so we run straight from `src` — Node 24 strips the types
// itself and a resolve hook makes the monorepo's source-first layout resolvable (inject the `source` export
// condition; map the repo's NodeNext `.js` specifiers to their `.ts` source). No build, no transpiler, no native
// dependency — so `pnpm sync` always reflects the current source and survives the ungated-CI ignore-scripts guard.
//
// Installed as a published package, `src` is absent (the `files` allowlist ships `dist` only), so we run the
// compiled bin instead. This file is the published bin entry, hence committed rather than generated.
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'

if (existsSync(new URL('../src/cli/entry-point.ts', import.meta.url))) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const conditions = context.conditions.includes('source') ? context.conditions : [...context.conditions, 'source']
      const ctx = { ...context, conditions }

      if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
        const tsSpecifier = `${specifier.slice(0, -3)}.ts`
        if (ctx.parentURL !== undefined && existsSync(new URL(tsSpecifier, ctx.parentURL))) {
          return nextResolve(tsSpecifier, ctx)
        }
      }

      return nextResolve(specifier, ctx)
    },
  })

  await import('../src/cli/entry-point.js')
} else {
  /** @type {string} */
  const compiledEntry = '../dist/cli/entry-point.js'
  await import(compiledEntry)
}
