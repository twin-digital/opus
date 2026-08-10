import { describe, expect, it } from 'vitest'
import type { MessageView } from '../types.js'
import { BODY_PLACEHOLDER_MAX_CHARS, BODY_TRUNCATION_MARKER, renderTemplate } from './template.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'm1',
    from: 'alice@example.com',
    from_email: 'alice@example.com',
    from_domain: 'example.com',
    to: 'me@example.com',
    subject: 'Invoice #42 due',
    snippet: 'please pay',
    bodyText: 'the full body text',
    bodyHtml: null,
    receivedAt: 0,
    headers: new Map(),
    thread: null,
    ...over,
  }
}

function render(template: string, over: Partial<MessageView> = {}, tags: Record<string, string> = {}): string {
  return renderTemplate(template, message(over), new Map(Object.entries(tags)))
}

describe('renderTemplate', () => {
  it('substitutes message fields', () => {
    expect(render('Subject: {{subject}}')).toBe('Subject: Invoice #42 due')
    expect(render('{{from}} -> {{to}}')).toBe('alice@example.com -> me@example.com')
    expect(render('{{snippet}} / {{body}}')).toBe('please pay / the full body text')
  })

  it('substitutes tag values via tag.<key>', () => {
    expect(render('priority={{tag.urgency}}', {}, { urgency: 'high' })).toBe('priority=high')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(render('[{{  subject  }}]')).toBe('[Invoice #42 due]')
  })

  it('renders null message fields as empty string', () => {
    expect(render('s=[{{subject}}]', { subject: null })).toBe('s=[]')
  })

  it('renders an absent tag as empty string', () => {
    expect(render('t=[{{tag.missing}}]')).toBe('t=[]')
  })

  it('renders an unknown placeholder as empty string', () => {
    expect(render('x=[{{bogus}}]')).toBe('x=[]')
    expect(render('x=[{{ nope.field }}]')).toBe('x=[]')
  })

  it('passes through non-placeholder text and lone braces', () => {
    expect(render('a { b } c {{subject}}')).toBe('a { b } c Invoice #42 due')
  })

  it('renders a body at the cap unmodified', () => {
    const body = 'x'.repeat(BODY_PLACEHOLDER_MAX_CHARS)
    expect(render('{{body}}', { bodyText: body })).toBe(body)
  })

  it('caps an over-long body, marker included, at exactly the cap', () => {
    const body = 'x'.repeat(BODY_PLACEHOLDER_MAX_CHARS + 1)
    const rendered = render('{{body}}', { bodyText: body })
    expect(rendered).toBe(
      body.slice(0, BODY_PLACEHOLDER_MAX_CHARS - BODY_TRUNCATION_MARKER.length) + BODY_TRUNCATION_MARKER,
    )
    expect(rendered).toHaveLength(BODY_PLACEHOLDER_MAX_CHARS)
  })

  it('the cap applies only to {{body}}, not other fields', () => {
    const long = 'y'.repeat(BODY_PLACEHOLDER_MAX_CHARS + 100)
    expect(render('{{subject}}', { subject: long })).toBe(long)
  })
})
