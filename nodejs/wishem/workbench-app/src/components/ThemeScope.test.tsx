import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeScope, useThemeScopeElement } from './ThemeScope.js'

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

describe('useThemeScopeElement', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  /** Records the element that the hook gives, keyed by the id of the probe. */
  const found = new Map<string, HTMLElement | null>()
  const Probe = ({ id }: { id: string }) => {
    found.set(id, useThemeScopeElement())
    return null
  }

  it('gives the element of the nearest scope', () => {
    act(() => {
      root.render(
        <ThemeScope theme='light' testId='outer'>
          <Probe id='outer' />
          <ThemeScope theme='dark' testId='inner'>
            <Probe id='inner' />
          </ThemeScope>
        </ThemeScope>,
      )
    })
    expect(found.get('outer')).toBe(container.querySelector('[data-testid="outer"]'))
    expect(found.get('inner')).toBe(container.querySelector('[data-testid="inner"]'))
    expect(found.get('inner')?.getAttribute('data-theme')).toBe('dark')
  })

  it('gives null with no scope', () => {
    act(() => {
      root.render(<Probe id='none' />)
    })
    expect(found.get('none')).toBeNull()
  })
})
