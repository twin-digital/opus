import { describe, it, expect } from 'vitest'

import { generateFounding } from './generate.js'
import { renderFounding } from './render.js'

describe('generateFounding', () => {
  it('is deterministic for a given seed', () => {
    expect(generateFounding(7)).toEqual(generateFounding(7))
  })

  it('different seeds usually produce different compacts', () => {
    const signatures = new Set(
      Array.from({ length: 25 }, (_unused, i) => {
        const f = generateFounding(i)
        return `${f.name}|${f.charter.purpose}`
      }),
    )
    expect(signatures.size, `too little variety: ${signatures.size} distinct`).toBeGreaterThan(8)
  })

  it('every founding satisfies the quality contract (seeds 0–199)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const f = generateFounding(seed)

      // graspable cast
      expect(f.cast.length >= 5 && f.cast.length <= 8, `cast size ${f.cast.length} (seed ${seed})`).toBe(true)
      expect(new Set(f.cast.map((s) => s.name)).size, `duplicate seeker (seed ${seed})`).toBe(f.cast.length)

      // legible charter
      expect(f.charter.purpose.length, `empty purpose (seed ${seed})`).toBeGreaterThan(0)
      expect(f.charter.domains.length, `thin charter domains (seed ${seed})`).toBeGreaterThanOrEqual(2)

      // >=1 tension, >=1 thread, fully resolved (no unfilled template tokens)
      expect(f.tension.length > 0 && f.openThread.length > 0, `missing tension/thread (seed ${seed})`).toBe(true)
      expect(f.tension.includes('{'), `unfilled token in tension (seed ${seed}): ${f.tension}`).toBe(false)
      expect(f.openThread.includes('{'), `unfilled token in thread (seed ${seed}): ${f.openThread}`).toBe(false)

      // coherent membership
      expect(f.membership, `membership too small (seed ${seed})`).toBeGreaterThan(f.cast.length)
    }
  })

  it('rendered output names every seeker and leaves no unfilled tokens', () => {
    const f = generateFounding(42)
    const text = renderFounding(f)
    expect(text).toContain(f.name.toUpperCase())
    expect(text).toContain('CHARTER')
    expect(text).toContain(`seed ${f.seed}`)
    for (const s of f.cast) {
      expect(text, `render missing ${s.name}`).toContain(s.name)
    }
    expect(text.includes('{'), 'unfilled token in rendered output').toBe(false)
  })
})
