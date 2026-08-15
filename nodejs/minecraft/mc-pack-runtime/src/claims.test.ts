import { describe, it } from 'vitest'

// d-q7mz2qb0: at load the runtime enumerates the declared entity types and exposes the foreign
// claims it finds in the pack's namespace. A test registers claim types via the test lib's
// `registerEntityType` — e.g. its own `arena:mcdk_claim_acme-arena` beside a rival's
// `arena:mcdk_claim_bob-arena` — and reads the content log back with `getOutput`.
describe('foreignNamespaceClaims', () => {
  it.todo("exposes a claim in the pack's namespace carrying another pack's token")
  it.todo('writes the contention to the content log')
  it.todo("answers empty and logs nothing where only the pack's own claim stands")
  it.todo('ignores claim types in other namespaces, and non-claim types in its own')
  it.todo('answers empty and logs nothing where no namespace was injected')
})
