import { describe, expect, it } from 'vitest'

import { ActorDefinitionsMissingError } from './errors.js'

describe('ActorDefinitionsMissingError', () => {
  const error = new ActorDefinitionsMissingError('wizard', 'rpg:wizard', 'RPG Core Actors')

  it('is an Error', () => {
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ActorDefinitionsMissingError')
  })

  it('carries the preset, the identifier, and the pack', () => {
    expect(error.preset).toBe('wizard')
    expect(error.identifier).toBe('rpg:wizard')
    expect(error.pack).toBe('RPG Core Actors')
  })

  it('names all three in its message', () => {
    expect(error.message).toContain('wizard')
    expect(error.message).toContain('rpg:wizard')
    expect(error.message).toContain('RPG Core Actors')
  })
})
