import { describe, expect, it } from 'vitest'
import { type ClassifyRun, classifyInputs } from './classify-inputs.js'

/**
 * Pure-function tests for input classification (pipeline-runtime.md "Input
 * classification"). No DB, no registry — the loop resolves Contracts and Tags
 * then hands the facts to this function.
 */

function run(partial: Partial<ClassifyRun> & { operatorId: number }): ClassifyRun {
  return {
    operatorId: partial.operatorId,
    inputKeys: partial.inputKeys ?? [],
    outputKeys: partial.outputKeys ?? [],
    status: partial.status ?? 'pending',
  }
}

describe('classifyInputs', () => {
  it('a run with no declared inputs is always satisfied (raw Message fields)', () => {
    const a = run({ operatorId: 1 })
    expect(classifyInputs(a, [a], new Set()).status).toBe('satisfied')
  })

  it('satisfied when every declared input Tag key is present in the Triage', () => {
    const a = run({ operatorId: 1, inputKeys: ['urgency'] })
    expect(classifyInputs(a, [a], new Set(['urgency'])).status).toBe('satisfied')
  })

  it('waits (pending) when the owner of an input is still pending', () => {
    const owner = run({
      operatorId: 1,
      outputKeys: ['urgency'],
      status: 'pending',
    })
    const b = run({ operatorId: 2, inputKeys: ['urgency'] })
    expect(classifyInputs(b, [owner, b], new Set()).status).toBe('pending')
  })

  it('waits when the owner is running', () => {
    const owner = run({
      operatorId: 1,
      outputKeys: ['urgency'],
      status: 'running',
    })
    const b = run({ operatorId: 2, inputKeys: ['urgency'] })
    expect(classifyInputs(b, [owner, b], new Set()).status).toBe('pending')
  })

  it('definitively_missing when the owner failed (cascade skip)', () => {
    const owner = run({
      operatorId: 1,
      outputKeys: ['urgency'],
      status: 'failed',
    })
    const b = run({ operatorId: 2, inputKeys: ['urgency'] })
    const result = classifyInputs(b, [owner, b], new Set())
    expect(result.status).toBe('definitively_missing')
    if (result.status === 'definitively_missing') {
      expect(result.reason).toContain('urgency')
    }
  })

  it('definitively_missing when the owner was skipped, naming the owner in the reason', () => {
    const owner = run({
      operatorId: 1,
      outputKeys: ['urgency'],
      status: 'skipped',
    })
    const b = run({ operatorId: 2, inputKeys: ['urgency'] })
    const result = classifyInputs(b, [owner, b], new Set())
    expect(result.status).toBe('definitively_missing')
    if (result.status === 'definitively_missing') {
      // The reason names the input key, the owning Operator, and its status —
      // not just the aggregate classification.
      expect(result.reason).toContain("'urgency'")
      expect(result.reason).toContain('Operator 1')
      expect(result.reason).toContain('skipped')
    }
  })

  it('definitively_missing + warning when owner completed without producing the Tag', () => {
    const owner = run({
      operatorId: 1,
      outputKeys: ['urgency'],
      status: 'completed',
    })
    const b = run({ operatorId: 2, inputKeys: ['urgency'] })
    // Owner completed but the Tag is NOT in the Triage's tag set → inconsistency.
    const result = classifyInputs(b, [owner, b], new Set())
    expect(result.status).toBe('definitively_missing')
    if (result.status === 'definitively_missing') {
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]?.inputKey).toBe('urgency')
    }
  })

  it('definitively_missing when no Operator owns the declared input (dangling), naming the key', () => {
    const b = run({ operatorId: 2, inputKeys: ['nobody_produces_this'] })
    const result = classifyInputs(b, [b], new Set())
    expect(result.status).toBe('definitively_missing')
    if (result.status === 'definitively_missing') {
      expect(result.reason).toContain("'nobody_produces_this'")
      expect(result.reason).toContain('no producing Operator')
    }
  })

  it('joins multiple definitively-missing reasons with "; "', () => {
    // Two distinct missing inputs (one failed owner, one dangling) → both reasons
    // appear, joined by "; " (classify-inputs.ts reasons.join('; ')).
    const failedOwner = run({
      operatorId: 1,
      outputKeys: ['a'],
      status: 'failed',
    })
    const c = run({ operatorId: 2, inputKeys: ['a', 'no_owner'] })
    const result = classifyInputs(c, [failedOwner, c], new Set())
    expect(result.status).toBe('definitively_missing')
    if (result.status === 'definitively_missing') {
      expect(result.reason).toContain('; ')
      expect(result.reason).toContain("'a'")
      expect(result.reason).toContain("'no_owner'")
    }
  })

  it('aggregates: any definitively_missing wins over a still-waiting input', () => {
    const failed = run({ operatorId: 1, outputKeys: ['a'], status: 'failed' })
    const pending = run({ operatorId: 2, outputKeys: ['b'], status: 'running' })
    const c = run({ operatorId: 3, inputKeys: ['a', 'b'] })
    expect(classifyInputs(c, [failed, pending, c], new Set()).status).toBe('definitively_missing')
  })

  it('satisfied for a multi-input run when all keys are present', () => {
    const c = run({ operatorId: 3, inputKeys: ['a', 'b'] })
    expect(classifyInputs(c, [c], new Set(['a', 'b'])).status).toBe('satisfied')
  })
})
