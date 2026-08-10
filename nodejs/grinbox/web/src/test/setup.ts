import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Deterministic isolation between tests. RTL's container is unmounted by
// cleanup(); Radix and other portal primitives render into document.body
// *outside* that container and can leave residue (stray nodes, aria-hidden,
// pointer-events:none) that pollutes the next test — especially under the
// single-fork pool where files share one jsdom document. Reset it explicitly
// after every test so rendered output never accumulates across tests/files.
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  document.body.removeAttribute('style')
  document.body.removeAttribute('aria-hidden')
})

// jsdom lacks matchMedia (used by the theme provider for OS preference) and the
// observer/pointer APIs Radix primitives probe. Stub them for the smoke test.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom defines scrollTo only as a stub that prints "Not implemented" to stderr
// when called (TanStack Router calls it on navigation). Override it unconditionally
// with a no-op to keep the test log clean.
window.scrollTo = () => {}
