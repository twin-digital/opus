import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const themeCss = readFileSync(join(import.meta.dirname, 'styles', 'theme.css'), 'utf8')

describe('theme.css', () => {
  it.each(['sm', 'md', 'lg'])('the rounded-%s class reads the radius step of the same name', (step) => {
    expect(themeCss).toMatch(new RegExp(`@utility rounded-${step} \\{\\s*border-radius: var\\(--radius-${step}\\);`))
  })

  it.each(['sm', 'md'])('the shadow-%s class reads the shadow step of the same name', (step) => {
    expect(themeCss).toMatch(new RegExp(`@utility shadow-${step} \\{\\s*box-shadow: var\\(--shadow-${step}\\);`))
  })

  it.each(['color', 'radius', 'shadow'])('the Tailwind default %s scale is removed', (scale) => {
    expect(themeCss).toMatch(new RegExp(`--${scale}-\\*:\\s*initial;`))
  })
})
