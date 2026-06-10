import { describe, expect, it } from 'vitest'
import { gmailMessageUrl } from './gmail-url.js'

describe('gmailMessageUrl', () => {
  it('builds an #all deep-link for the default account slot', () => {
    expect(gmailMessageUrl('m1')).toBe('https://mail.google.com/mail/u/0/#all/m1')
  })

  it('honors a non-default account index', () => {
    expect(gmailMessageUrl('abc', 2)).toBe('https://mail.google.com/mail/u/2/#all/abc')
  })

  it('URL-encodes the message id', () => {
    expect(gmailMessageUrl('a/b c')).toBe('https://mail.google.com/mail/u/0/#all/a%2Fb%20c')
  })
})
