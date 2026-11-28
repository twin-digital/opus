import type { InputOutcome } from '@thrashplay/wishem-renderer-react'
import { describe, expect, it } from 'vitest'
import { outcomeText } from './outcome-text.js'

type Rejection = Extract<InputOutcome, { ok: false }>

const reject = (reason: Rejection['reason'], problems: Rejection['problems'] = []): Rejection => ({
  ok: false,
  reason,
  problems,
})

describe('outcomeText', () => {
  it('tells that the workbench does not run', () => {
    expect(outcomeText(reject('not-running'))).toBe('The workbench does not run. Start it, and try again.')
  })

  it('tells that the connection ended before an answer', () => {
    expect(outcomeText(reject('unknown'))).toBe(
      'The connection ended before an answer. Look at the title after it connects.',
    )
  })

  it('tells that the page cannot send changes', () => {
    expect(outcomeText(reject('not-permitted'))).toBe('This page cannot send changes.')
  })

  it('gives the message of the first problem of an invalid input', () => {
    expect(outcomeText(reject('invalid', [{ message: 'The title is too long.' }, { message: 'Second.' }]))).toBe(
      'The title is too long.',
    )
  })

  it('tells that the workbench refused an invalid input with no problem', () => {
    expect(outcomeText(reject('invalid'))).toBe('The workbench refused the change.')
  })

  it('tells that the workbench refused an unknown type', () => {
    expect(outcomeText(reject('unknown-type'))).toBe('The workbench refused the change.')
  })

  it('tells that the workbench failed to apply the change', () => {
    expect(outcomeText(reject('failed'))).toBe('The workbench failed to apply the change.')
  })
})
