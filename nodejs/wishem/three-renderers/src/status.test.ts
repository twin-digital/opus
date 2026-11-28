import { describe, expect, it } from 'vitest'
import { statusText } from './status.js'

describe('statusText', () => {
  it('says that the page connects before the first link', () => {
    expect(statusText({ state: 'connecting' })).toBe('Connecting to the construct.')
  })

  it('shows the number of the link', () => {
    expect(statusText({ state: 'connected', link: 1 })).toBe('Connected (link 1).')
    expect(statusText({ state: 'connected', link: 2 })).toBe('Connected (link 2).')
  })

  it('says that the construct is not reachable while the link is down', () => {
    expect(statusText({ state: 'down', link: 1 })).toBe('The construct is not reachable. The page tries again.')
  })
})
