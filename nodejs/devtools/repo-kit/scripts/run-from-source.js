// Internal launcher: runs repo-kit's CLI straight from TypeScript source so monorepo scripts (`pnpm sync`,
// `pnpm update-readme`) always reflect the current `src/` — never a stale `dist`. The published package still
// ships and runs the compiled bin (`dist/cli/entry-point.js`); this path is for in-repo use only and is excluded
// from the published tarball (the package's `files` allowlist ships `dist` only).
//
// Usage: node scripts/run-from-source.js <command> [args...]
import { register } from 'node:module'

register('./source-resolver.js', import.meta.url)

// Importing the entry point runs its top-level `main()`, which parses `process.argv` — so the forwarded command
// and args take effect exactly as they would through the compiled bin. The `.js` specifier is remapped to the
// `.ts` source by the registered hook at runtime (and resolved to it by TypeScript at check time).
await import('../src/cli/entry-point.js')
