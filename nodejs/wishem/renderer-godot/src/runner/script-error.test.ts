import { describe, expect, it } from 'vitest'
import { hasScriptError } from './script-error.js'

describe('hasScriptError', () => {
  it('finds a runtime script error', () => {
    expect(hasScriptError('SCRIPT ERROR: Invalid call. Nonexistent function.')).toBe(true)
  })

  it('finds a script error with a leading space', () => {
    expect(hasScriptError('   SCRIPT ERROR: Parse Error: x')).toBe(true)
  })

  it('ignores the line of a push_error', () => {
    expect(hasScriptError('ERROR: wishem: the folder does not exist.')).toBe(false)
  })

  it('ignores a test line', () => {
    expect(hasScriptError('PASS test_views.gd test_a')).toBe(false)
  })
})
