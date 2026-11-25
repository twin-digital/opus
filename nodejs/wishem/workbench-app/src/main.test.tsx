import { describe, expect, it, vi } from 'vitest'

describe('workbench page', () => {
  it('shows the zero state in a main element that fills the screen', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await import('./main.js')
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Nothing to show yet.')
    })
    expect(Array.from(document.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      'Workbench',
      'Nothing to show yet.',
    ])
    expect(document.querySelector('main')?.classList.contains('h-screen')).toBe(true)
  })
})
