/** The error classes the library declares, because none of the engine's is importable at runtime. */

import { describe, expect, it } from 'vitest'

import {
  ArgumentOutOfBoundsError,
  failedCallMessage,
  failedPropertyMessage,
  InvalidArgumentError,
  InvalidEntityError,
  NotImplementedError,
  UnsetValueError,
} from './errors.js'
import * as library from './index.js'

describe('InvalidEntityError', () => {
  it('extends Error', () => {
    const error = new InvalidEntityError('-42', 'minecraft:sheep', 'message')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(InvalidEntityError)
  })

  it('sets its name', () => {
    expect(new InvalidEntityError('-42', 'minecraft:sheep', 'message').name).toBe('InvalidEntityError')
  })

  it("carries the entity's id and type", () => {
    const error = new InvalidEntityError('-42', 'minecraft:sheep', 'message')
    expect(error.id).toBe('-42')
    expect(error.type).toBe('minecraft:sheep')
    expect(error.message).toBe('message')
  })

  it('keeps a usable stack', () => {
    expect(new InvalidEntityError('-42', 'minecraft:sheep', 'message').stack).toContain('InvalidEntityError')
  })
})

describe('ArgumentOutOfBoundsError', () => {
  it('extends Error and names itself', () => {
    const message = 'Unsupported or out of bounds value passed to function argument [0]: value, Value: 9'
    const error = new ArgumentOutOfBoundsError(message)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ArgumentOutOfBoundsError')
    expect(error.message).toBe(message)
  })
})

describe('InvalidArgumentError', () => {
  it('extends Error and names itself', () => {
    const message = 'Invalid value passed to argument [0]. The event x does not exist on minecraft:sheep'
    const error = new InvalidArgumentError(message)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('InvalidArgumentError')
    expect(error.message).toBe(message)
  })
})

describe('NotImplementedError', () => {
  it('names the member and explains itself', () => {
    const error = new NotImplementedError('Entity.teleport')
    expect(error.member).toBe('Entity.teleport')
    expect(error.name).toBe('NotImplementedError')
    expect(error.message).toBe('Entity.teleport is declared by @minecraft/server but is not modelled by this library.')
  })
})

describe('UnsetValueError', () => {
  it('names the member and explains itself', () => {
    const error = new UnsetValueError('Entity.nameTag')
    expect(error.member).toBe('Entity.nameTag')
    expect(error.name).toBe('UnsetValueError')
    expect(error.message).toBe(
      'Entity.nameTag was never supplied. Set it when creating the fake, or supply it before reading.',
    )
  })
})

describe('error classes', () => {
  it('are distinguishable from one another', () => {
    expect(new NotImplementedError('x')).not.toBeInstanceOf(UnsetValueError)
    expect(new UnsetValueError('x')).not.toBeInstanceOf(NotImplementedError)
    expect(new NotImplementedError('x')).not.toBeInstanceOf(InvalidEntityError)
    expect(new ArgumentOutOfBoundsError('x')).not.toBeInstanceOf(InvalidArgumentError)
  })

  it('are all reachable from the entry point', () => {
    expect(library.InvalidEntityError).toBe(InvalidEntityError)
    expect(library.ArgumentOutOfBoundsError).toBe(ArgumentOutOfBoundsError)
    expect(library.InvalidArgumentError).toBe(InvalidArgumentError)
    expect(library.NotImplementedError).toBe(NotImplementedError)
    expect(library.UnsetValueError).toBe(UnsetValueError)
  })
})

describe('the plain-Error message builders', () => {
  it("builds the engine's failed-property text", () => {
    expect(failedPropertyMessage('current')).toBe("Failed to get property 'current'.")
  })

  it("builds the engine's failed-call text", () => {
    expect(failedCallMessage('resetToMinValue')).toBe("Failed to call function 'resetToMinValue'.")
  })
})
