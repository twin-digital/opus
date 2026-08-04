/**
 * The aliased `@minecraft/server` surface: what a runner's resolver points the specifier at, so a
 * pack's value imports — enum members, classes, the two singletons — resolve under test.
 *
 * This module is not a published subpath. The vitest plugin references it by resolved path; a
 * consumer never names it. It models no engine behaviour of its own: every value here is an enum
 * member, a module constant, a class, or one of the two bindings a test installs, and every
 * behaviour a test observes comes from the fakes those bindings point at.
 *
 * Nothing the pinned declarations do not declare is exported — no Proxy over unknown names, no
 * auto-vivified stub, no fallback value. A pack importing a name this version does not carry
 * fails at the import rather than reading something invented.
 */

export * from '../generated/shim/surface.js'
export { system, world } from './bindings.js'
