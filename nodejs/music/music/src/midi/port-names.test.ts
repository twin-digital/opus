import { describe, expect, it } from 'vitest'

import { listNumberedPortNames, type PortLister } from './port-names.js'

const fakeClient = (names: string[]): PortLister => ({
  getPortCount: () => names.length,
  getPortName: (port: number) => names[port],
})

describe('listNumberedPortNames', () => {
  it('returns port names in port order', () => {
    expect(listNumberedPortNames(fakeClient(['Piano', 'Launchpad']))).toEqual(['Piano', 'Launchpad'])
  })

  it('returns an empty list when no ports exist', () => {
    expect(listNumberedPortNames(fakeClient([]))).toEqual([])
  })

  it('suffixes duplicate names the way easymidi numbers them', () => {
    expect(listNumberedPortNames(fakeClient(['Piano', 'Piano', 'Piano']))).toEqual(['Piano', 'Piano1', 'Piano2'])
  })

  it('does not collide a generated suffix with a real port name', () => {
    // easymidi's scheme keeps incrementing until the name is unused
    expect(listNumberedPortNames(fakeClient(['Piano', 'Piano1', 'Piano']))).toEqual(['Piano', 'Piano1', 'Piano2'])
  })
})
