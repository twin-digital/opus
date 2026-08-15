import { describe, it } from 'vitest'

// d-wj60379v: the runtime checks the pack's type family on every entity it hands back. The cases
// below are the decision's, exactly. The fakes come from @twin-digital/minecraft-test-lib: a test
// registers types, attaches `minecraft:type_family` state, and reads the world back.
describe('spawnEntity', () => {
  it.todo("returns the spawned entity where it carries the pack's own family")
  it.todo('removes the spawned entity and raises ForeignEntityError where it lacks the family')
  it.todo('spawns unchecked where no namespace was injected, so the build stamped no family')
  it.todo('the raised error names the entity type, the expected family, and that it removed')
})

describe('getEntity', () => {
  it.todo("returns the entity where it carries the pack's own family")
  it.todo('raises ForeignEntityError where it lacks the family, leaving the entity where it was found')
  it.todo('returns undefined where nothing answers, checked and unchecked alike')
  it.todo('returns unchecked where no namespace was injected')
})

describe('getEntities', () => {
  it.todo("returns every entity where all carry the pack's own family")
  it.todo('omits the foreign entities from a mixed result, and returns it')
  it.todo('returns every entity unchecked where no namespace was injected')
})
