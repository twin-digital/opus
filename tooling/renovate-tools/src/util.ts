/**
 * Index a record, returning `undefined` for absent keys.
 *
 * The repo's shared tsconfig omits `noUncheckedIndexedAccess`, so plain `record[key]` is typed as
 * always-present — which makes genuinely-necessary `undefined` guards trip `no-unnecessary-condition`.
 * Routing index access through a function (whose declared return type isn't control-flow-narrowed to
 * the initializer) restores the honest `T | undefined`.
 */
export const lookup = <T>(record: Record<string, T>, key: string): T | undefined => record[key]
