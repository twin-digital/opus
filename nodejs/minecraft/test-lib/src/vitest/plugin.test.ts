/**
 * The one runner-config entry: what the plugin contributes, and that the two files it points a
 * resolver at exist and load.
 */

import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import { minecraftTestLib } from './index.js'
import { setupPath, shimPath, siblingStubs } from './paths.js'

const contributed = minecraftTestLib().config()

describe('the plugin', () => {
  it('contributes an alias and a setup file — the whole install', () => {
    expect(contributed.resolve.alias.length).toBeGreaterThan(0)
    expect(contributed.test.setupFiles).toEqual([setupPath()])
  })

  it('aliases @minecraft/server to the shipped surface', () => {
    const entry = contributed.resolve.alias.find((alias) => alias.find.test('@minecraft/server'))
    expect(entry?.replacement).toBe(shimPath())
  })

  it('aliases the sibling modules the fakes do not cover to shipped stubs', () => {
    for (const [specifier, stub] of Object.entries(siblingStubs())) {
      const entry = contributed.resolve.alias.find((alias) => alias.find.test(specifier))
      expect(entry?.replacement, specifier).toBe(stub)
    }
  })

  it('does not catch a sibling specifier with the @minecraft/server entry', () => {
    const server = contributed.resolve.alias.find((alias) => alias.replacement === shimPath())
    expect(server?.find.test('@minecraft/server-ui')).toBe(false)
  })

  it('points at files that exist', () => {
    expect(fs.existsSync(shimPath())).toBe(true)
    expect(fs.existsSync(setupPath())).toBe(true)
    for (const stub of Object.values(siblingStubs())) {
      expect(fs.existsSync(stub)).toBe(true)
    }
  })
})

describe('the sibling stubs', () => {
  it('resolve a pack import and answer with declared values', async () => {
    const ui = (await import('../generated/shim/server-ui.js')) as Record<string, unknown>
    expect(ui.FormCancelationReason).toEqual({ UserBusy: 'UserBusy', UserClosed: 'UserClosed' })
  })

  it('say they are unmodelled at the first call rather than fabricating', async () => {
    const { NotImplementedError } = await import('../errors.js')
    const ui = (await import('../generated/shim/server-ui.js')) as unknown as Record<string, new () => unknown>
    expect(() => new ui.ActionFormData()).toThrow(NotImplementedError)
  })

  it('emit a declared error class as a real Error subclass', async () => {
    const ui = (await import('../generated/shim/server-ui.js')) as unknown as Record<string, new () => Error>
    const thrown = new ui.FormRejectError()
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.name).toBe('FormRejectError')
  })
})
