import { describe, expect, it } from 'vitest'

import { lastPackStack, matchPackStack } from './readiness.js'

const loaded =
  '[2026-08-05 02:19:55:389 INFO] Pack Stack - [00] probe pack1 (id: a1111111-1111-4111-8111-111111111111, version: 1.0.0) @ development_behavior_packs/a1111111-1111-4111-8111-111111111111'
const none = '[2026-07-24 21:30:04:703 INFO] Pack Stack - None'

describe('the world-load pack stack line', () => {
  // d-i4oryd9x — readiness is the world-load pack stack line, reported as what the load brought up
  it('reports what the load brought up', () => {
    expect(matchPackStack(loaded)).toMatchObject({ none: false })
    expect(matchPackStack(loaded)?.stack).toContain('probe pack1')
  })

  // an unlisted or misrouted pack is exactly what produces this line
  it('recognises a load that brought nothing up', () => {
    expect(matchPackStack(none)).toMatchObject({ stack: 'None', none: true })
  })

  it('ignores every other line', () => {
    expect(matchPackStack('[2026-08-05 02:19:00:000 INFO] Starting Server')).toBeUndefined()
  })

  // d-ifke5eeh — a reattach reaches readiness from the line already in the log
  it('takes the last load a log holds', () => {
    expect(lastPackStack([none, 'noise', loaded].join('\n'))?.none).toBe(false)
  })

  it('reports nothing when no world has loaded', () => {
    expect(lastPackStack('starting\n')).toBeUndefined()
  })
})
