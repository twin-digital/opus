import { existsSync } from 'node:fs'

/**
 * ESM resolution hook that lets Node run repo-kit's TypeScript sources directly, with no transpiler or native
 * dependency — Node strips the types itself. Two adjustments make the monorepo's source-first layout resolvable:
 *
 *   1. Inject the `source` export condition, so workspace dependencies resolve to their `src/*.ts` (matching the
 *      `customConditions: ["source"]` that tsconfig/bundlers use) rather than their compiled `dist`.
 *   2. Remap relative `.js` specifiers — required by the repo's NodeNext convention — to the sibling `.ts` when one
 *      exists on disk. Published deps (which ship `.js`) have no `.ts` sibling and are left untouched.
 *
 * @type {import('node:module').ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  const conditions = context.conditions.includes('source') ? context.conditions : [...context.conditions, 'source']
  const ctx = { ...context, conditions }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
    const tsSpecifier = `${specifier.slice(0, -3)}.ts`
    if (ctx.parentURL !== undefined && existsSync(new URL(tsSpecifier, ctx.parentURL))) {
      return nextResolve(tsSpecifier, ctx)
    }
  }

  return nextResolve(specifier, ctx)
}
