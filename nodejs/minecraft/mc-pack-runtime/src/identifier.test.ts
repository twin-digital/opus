import { afterEach, describe, expect, it } from 'vitest'

import { packFamily, packId, packNamespace } from './identifier.js'
import { INJECTION_GLOBAL, type PackRuntimeInjection } from './injection.js'

const host = globalThis as { __MC_PACK_RUNTIME__?: PackRuntimeInjection }

// Frozen value and frozen prefix list, exactly as the build assigns them: reading must never
// depend on mutability.
const inject = ({
  namespace,
  packToken,
  prefixes = [],
}: Omit<PackRuntimeInjection, 'prefixes'> & { prefixes?: readonly string[] }): void => {
  host[INJECTION_GLOBAL] = Object.freeze({ namespace, packToken, prefixes: Object.freeze([...prefixes]) })
}

afterEach(() => {
  delete host.__MC_PACK_RUNTIME__
})

// d-zm6pxfrg: the namespace reaches code as an injected constant, and the kit exposes a helper
// spelling a bare name into a full identifier.
describe('packId', () => {
  it('spells a bare name into the injected namespace', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena' })
    expect(packId('wizard')).toBe('arena:wizard')
  })

  // r-tvea5tvf: a vendored library's own calls resolve unaided — nothing passed or configured
  // per call, so two callers compiled apart spell the same identifier.
  it('resolves through the injection alone, the same for every caller', () => {
    inject({ namespace: 'hostpack', packToken: 'acme-hostpack' })
    const vendoredLibraryCall = (): string => packId('guard_post')
    const vendoringPackCall = (): string => packId('guard_post')
    expect(vendoredLibraryCall()).toBe('hostpack:guard_post')
    expect(vendoredLibraryCall()).toBe(vendoringPackCall())
  })

  // The dotted forms: a composed name's first segment claims a vendored prefix, and the tail is
  // the vendored pack's own name, not this helper's to validate.
  it("spells a composed name whose prefix is one of the pack's vendored prefixes", () => {
    inject({ namespace: 'arena', packToken: 'acme-arena', prefixes: ['pack1', 'pack2'] })
    expect(packId('pack1.fireball')).toBe('arena:pack1.fireball')
  })

  it('spells a composed name with a dotted tail, validating the first segment only', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena', prefixes: ['pack1'] })
    expect(packId('pack1.a.b')).toBe('arena:pack1.a.b')
  })

  it('rejects a dotted name whose first segment is no known prefix, naming the segment and the prefixes', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena', prefixes: ['pack1', 'pack2'] })
    expect(() => packId('pack9.fireball')).toThrow(/'pack9'/)
    expect(() => packId('pack9.fireball')).toThrow(/pack1, pack2/)
  })

  it('rejects a dotted name where the pack vendors nothing', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena' })
    expect(() => packId('pack1.fireball')).toThrow(/known prefixes: none/)
  })

  it('rejects a name already carrying a namespace', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena' })
    expect(() => packId('minecraft:sheep')).toThrow(/unnamespaced names only/)
  })

  it('throws where no namespace was injected', () => {
    expect(() => packId('wizard')).toThrow(/namespacing off/)
  })
})

describe('packNamespace', () => {
  it('answers the injected namespace', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena' })
    expect(packNamespace()).toBe('arena')
  })

  it('answers undefined where nothing was injected', () => {
    expect(packNamespace()).toBeUndefined()
  })
})

// d-wj60379v: the family the build stamps names the pack — the token, not the namespace — so two
// packs contending for one namespace still tell apart.
describe('packFamily', () => {
  it('answers the family stamped for the pack token', () => {
    inject({ namespace: 'arena', packToken: 'acme-arena' })
    expect(packFamily()).toBe('mcdk_pack_acme-arena')
  })

  it('answers undefined where nothing was injected', () => {
    expect(packFamily()).toBeUndefined()
  })
})
