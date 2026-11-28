import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ViewTools } from '@thrashplay/wishem-renderer-react'
import ClearColor from './ClearColor.js'

const wishem = {} as ViewTools

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draw = (color: string | undefined): HTMLElement => {
  const host = document.createElement('div')
  document.body.append(host)
  act(() => {
    createRoot(host).render(<ClearColor color={color} wishem={wishem} />)
  })
  return host
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the ClearColor view', () => {
  it('draws an image box of 320 by 180 pixels with the color', () => {
    const box = draw('#1d4ed8').querySelector('[role="img"]') as HTMLElement
    expect(box.getAttribute('aria-label')).toBe('Color #1d4ed8')
    expect(box.style.backgroundColor).toBe('rgb(29, 78, 216)')
    expect(box.style.width).toBe('320px')
    expect(box.style.height).toBe('180px')
  })

  it('draws nothing with no value', () => {
    expect(draw(undefined).innerHTML).toBe('')
  })
})
