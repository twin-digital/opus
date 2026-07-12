/**
 * Vite injects `import.meta.env` in browser builds (see launchpad-sim); this package
 * type-checks under NodeNext, where ImportMeta has no such property. The runtime code
 * only touches it behind a `typeof process === 'undefined'` guard.
 */
interface ImportMeta {
  readonly env: Record<string, string | undefined>
}
