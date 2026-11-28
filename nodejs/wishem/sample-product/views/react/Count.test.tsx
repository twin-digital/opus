import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ViewTools } from '@thrashplay/wishem-renderer-react'
import Count from './Count.js'

const wishem = {} as ViewTools

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draw = (count: number | undefined): HTMLElement => {
  const host = document.createElement('div')
  document.body.append(host)
  act(() => {
    createRoot(host).render(<Count count={count} wishem={wishem} />)
  })
  return host
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the Count view', () => {
  it('shows the count', () => {
    expect(draw(42).textContent).toBe('Count 42')
  })

  it('shows the count 0', () => {
    expect(draw(0).textContent).toBe('Count 0')
  })

  it('draws nothing with no value', () => {
    expect(draw(undefined).innerHTML).toBe('')
  })
})
