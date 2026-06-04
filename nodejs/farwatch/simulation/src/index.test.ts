import { describe, it, expect } from 'vitest'

import { createSimulation } from './index.js'

describe('createSimulation', () => {
  it('starts at tick 0 by default', () => {
    const sim = createSimulation()
    expect(sim.state.tick).toBe(0)
  })

  it('step advances by one tick by default', () => {
    const sim = createSimulation()
    const state = sim.step()
    expect(state.tick).toBe(1)
    expect(sim.state.tick).toBe(1)
  })

  it('step advances by the requested number of ticks', () => {
    const sim = createSimulation()
    sim.step(5)
    expect(sim.state.tick).toBe(5)
  })

  it('respects a custom initial tick', () => {
    const sim = createSimulation(10)
    expect(sim.state.tick).toBe(10)
  })

  it('rejects negative or non-integer steps', () => {
    const sim = createSimulation()
    expect(() => sim.step(-1)).toThrow(RangeError)
    expect(() => sim.step(1.5)).toThrow(RangeError)
  })

  it('rejects an invalid initial tick', () => {
    expect(() => createSimulation(-1)).toThrow(RangeError)
  })
})
