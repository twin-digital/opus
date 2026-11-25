import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ThemeScope } from './ThemeScope.js'

describe('ThemeScope', () => {
  it.each(['light', 'dark'] as const)('sets data-theme to %s on the element that holds the children', (theme) => {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(
      <ThemeScope theme={theme}>
        <p>content</p>
      </ThemeScope>,
    )
    expect(container.querySelector('p')?.parentElement?.getAttribute('data-theme')).toBe(theme)
  })
})
