import { describe, expect, it } from 'vitest'

import { decodeEntities, newsBodyParagraphs } from './news.js'

describe('newsBodyParagraphs', () => {
  it('returns nothing for null or empty bodies', () => {
    expect(newsBodyParagraphs(null)).toEqual([])
    expect(newsBodyParagraphs('')).toEqual([])
  })

  it('passes plain text through as one paragraph', () => {
    expect(newsBodyParagraphs('He practiced fully on Wednesday.')).toEqual(['He practiced fully on Wednesday.'])
  })

  it('splits block elements into paragraphs and strips inline tags', () => {
    const body = '<p>First <b>graf</b>.</p><p>Second <a href="https://x.test">graf</a>.</p><ul><li>third</li></ul>'
    expect(newsBodyParagraphs(body)).toEqual(['First graf.', 'Second graf.', 'third'])
  })

  it('drops script and style content entirely, including their text', () => {
    const body = '<style>p { color: red }</style><p>Kept.</p><script>alert("nope")</script><SCRIPT>x()</SCRIPT>'
    const paragraphs = newsBodyParagraphs(body)
    expect(paragraphs).toEqual(['Kept.'])
    expect(paragraphs.join(' ')).not.toContain('alert')
    expect(paragraphs.join(' ')).not.toContain('color')
  })

  it('drops HTML comments and unpaired tags', () => {
    expect(newsBodyParagraphs('<!-- hidden -->Visible<br>line two<img src="x">')).toEqual(['Visible', 'line two'])
  })

  it('decodes entities after stripping', () => {
    const body = '<p>Smith &amp; Jones &lt;probable&gt; &#8212; 50&nbsp;yards&#x21;</p>'
    expect(newsBodyParagraphs(body)).toEqual(['Smith & Jones <probable> — 50 yards!'])
  })

  it('collapses whitespace inside a paragraph', () => {
    expect(newsBodyParagraphs('a\t b\n<div>  c   d </div>')).toEqual(['a b', 'c d'])
  })
})

describe('decodeEntities', () => {
  it('decodes named, decimal, and hex entities, leaving unknowns alone', () => {
    expect(decodeEntities('&quot;a&apos; &#65;&#x42; &bogus; &amp;lt;')).toBe('"a\' AB &bogus; &lt;')
  })
})
