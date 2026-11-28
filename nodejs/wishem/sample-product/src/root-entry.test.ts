import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true })

describe('the root entry', () => {
  it('has source files', () => {
    expect(Object.keys(sources)).toContain('./index.ts')
  })

  it('imports no view and no module of React', () => {
    for (const [name, text] of Object.entries(sources)) {
      if (name.endsWith('.test.ts')) {
        continue
      }
      const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
      for (const specifier of specifiers) {
        expect(specifier, name).not.toMatch(/^react(-dom)?(\/|$)/)
        expect(specifier, name).not.toMatch(/wishem-renderer-react/)
        expect(specifier, name).not.toMatch(/views\//)
      }
    }
  })
})
