import { describe, expect, it } from 'vitest'
import { LINK_PROTOCOL_VERSION, parseClientMessage, parseHubMessage } from './messages.js'

const json = (value: unknown) => JSON.stringify(value)

const hello = { t: 'hello', protocol: 1, subsystems: [{ id: 'page', kind: 'output' }] }
const submit = { t: 'submit', request: 1, subsystem: 'keyboard', input: { type: 'a/b', payload: { x: 1 } } }
const welcome = { t: 'welcome', protocol: 1, status: 'running', seq: 3, state: { counter: { count: 6 } } }
const refused = { t: 'refused', reason: 'version', message: 'No.', supported: [1] }
const event = { t: 'event', event: 'started' }
const applied = {
  t: 'applied',
  input: { seq: 4, source: 'keyboard', type: 'a/b', payload: null },
  parts: { counter: { count: 8 } },
}
const result = { t: 'result', request: 1, result: { ok: true, seq: 4 } }

describe('LINK_PROTOCOL_VERSION', () => {
  it('is 1', () => {
    expect(LINK_PROTOCOL_VERSION).toBe(1)
  })
})

describe('parseClientMessage', () => {
  it('reads a hello', () => {
    expect(parseClientMessage(json(hello))).toEqual({ kind: 'message', message: hello })
  })

  it('reads a submit with and without a payload', () => {
    expect(parseClientMessage(json(submit))).toEqual({ kind: 'message', message: submit })
    const bare = { ...submit, input: { type: 'a/b' } }
    expect(parseClientMessage(json(bare))).toEqual({ kind: 'message', message: bare })
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['JSON null', 'null'],
    ['an object with no t', json({ protocol: 1 })],
    ['an object with a t that is not a string', json({ t: 5 })],
    ['a hello with no protocol', json({ ...hello, protocol: undefined })],
    ['a hello with a protocol that is not a number', json({ ...hello, protocol: '1' })],
    ['a hello with no subsystems', json({ ...hello, subsystems: undefined })],
    ['a hello with subsystems that are not a list', json({ ...hello, subsystems: {} })],
    ['a hello with a subsystem that is not an object', json({ ...hello, subsystems: [null] })],
    ['a hello with a subsystem with no id', json({ ...hello, subsystems: [{ kind: 'input' }] })],
    [
      'a hello with a subsystem with an id that is not text',
      json({ ...hello, subsystems: [{ id: 1, kind: 'input' }] }),
    ],
    ['a hello with a subsystem with no kind', json({ ...hello, subsystems: [{ id: 'a' }] })],
    ['a submit with no request', json({ ...submit, request: undefined })],
    ['a submit with a request that is not a number', json({ ...submit, request: '1' })],
    ['a submit with no subsystem', json({ ...submit, subsystem: undefined })],
    ['a submit with a subsystem that is not text', json({ ...submit, subsystem: 3 })],
    ['a submit with no input', json({ ...submit, input: undefined })],
    ['a submit with an input that is not an object', json({ ...submit, input: 'x' })],
    ['a submit with an input that is null', json({ ...submit, input: null })],
    ['a submit with an input with no type', json({ ...submit, input: { payload: 1 } })],
    ['a submit with an input type that is not text', json({ ...submit, input: { type: 1 } })],
  ])('gives undefined for %s', (_name, text) => {
    expect(parseClientMessage(text)).toBeUndefined()
  })

  it('gives undefined for a hello with one subsystem that is not correct in a list of correct ones', () => {
    const mixed = { ...hello, subsystems: [{ id: 'page', kind: 'output' }, { id: 'bad' }] }
    expect(parseClientMessage(json(mixed))).toBeUndefined()
  })

  it('gives undefined for a number that is not finite', () => {
    const text = '{"t":"hello","protocol":1e999,"subsystems":[{"id":"page","kind":"output"}]}'
    expect(parseClientMessage(text)).toBeUndefined()
  })

  it('marks a message with an unknown type', () => {
    const message = parseClientMessage(json({ t: 'future-thing', x: 1 }))
    expect(message).toEqual({ kind: 'unknown', t: 'future-thing' })
  })

  it.each([
    ['hello', hello],
    ['submit', submit],
  ])('reads a %s that has more keys, one of them named unknown', (_type, message) => {
    for (const extra of [{ unknown: true }, { unknown: false }, { other: 1 }]) {
      const withExtra = { ...message, ...extra }
      expect(parseClientMessage(json(withExtra))).toEqual({ kind: 'message', message: withExtra })
    }
  })

  it.each(['apply', 'part'])('marks the reserved type %s as unknown', (t) => {
    expect(parseClientMessage(json({ t }))).toEqual({ kind: 'unknown', t: t })
  })

  it('does not accept a hub message type as a known client message', () => {
    expect(parseClientMessage(json(welcome))).toEqual({ kind: 'unknown', t: 'welcome' })
  })
})

describe('parseHubMessage', () => {
  it('reads each type of message', () => {
    expect(parseHubMessage(json(welcome))).toEqual({ kind: 'message', message: welcome })
    expect(parseHubMessage(json(refused))).toEqual({ kind: 'message', message: refused })
    expect(parseHubMessage(json({ t: 'refused', reason: 'stopped', message: 'No.' }))).toEqual({
      kind: 'message',
      message: { t: 'refused', reason: 'stopped', message: 'No.' },
    })
    expect(parseHubMessage(json(event))).toEqual({ kind: 'message', message: event })
    expect(parseHubMessage(json({ t: 'event', event: 'stopping' }))).toEqual({
      kind: 'message',
      message: { t: 'event', event: 'stopping' },
    })
    expect(parseHubMessage(json(applied))).toEqual({ kind: 'message', message: applied })
    expect(parseHubMessage(json(result))).toEqual({ kind: 'message', message: result })
  })

  it('reads a welcome with each status and a refused with each reason', () => {
    for (const status of ['created', 'running']) {
      expect(parseHubMessage(json({ ...welcome, status }))).toEqual({
        kind: 'message',
        message: { ...welcome, status },
      })
    }
    for (const reason of ['malformed', 'version', 'id-in-use', 'unsupported', 'stopped']) {
      const message = { t: 'refused', reason, message: 'No.' }
      expect(parseHubMessage(json(message))).toEqual({ kind: 'message', message: message })
    }
  })

  it('reads a result with an error and a rejection', () => {
    const failed = { t: 'result', request: 2, error: 'It broke.' }
    expect(parseHubMessage(json(failed))).toEqual({ kind: 'message', message: failed })
    const rejected = { t: 'result', request: 3, result: { ok: false, reason: 'invalid', problems: [] } }
    expect(parseHubMessage(json(rejected))).toEqual({ kind: 'message', message: rejected })
  })

  it.each([
    ['text that is not JSON', '{'],
    ['an object with no t', json({})],
    ['a welcome with no status', json({ ...welcome, status: undefined })],
    ['a welcome with a status that is not known', json({ ...welcome, status: 'sleeping' })],
    ['a welcome with a seq that is not a number', json({ ...welcome, seq: '3' })],
    ['a welcome with no state', json({ ...welcome, state: undefined })],
    ['a welcome with a state that is a list', json({ ...welcome, state: [] })],
    ['a welcome with a state that is null', json({ ...welcome, state: null })],
    ['a welcome with no protocol', json({ ...welcome, protocol: undefined })],
    ['a refused with a reason that is not known', json({ ...refused, reason: 'because' })],
    ['a refused with no message', json({ ...refused, message: undefined })],
    ['a refused with a supported that is not a list', json({ ...refused, supported: 1 })],
    ['a refused with a supported that holds text', json({ ...refused, supported: ['1'] })],
    ['an event with an event that is not known', json({ t: 'event', event: 'applied' })],
    ['an event with no event', json({ t: 'event' })],
    ['an applied with no input', json({ ...applied, input: undefined })],
    ['an applied with an input with no seq', json({ ...applied, input: { source: 'a', type: 'a/b' } })],
    ['an applied with an input with no source', json({ ...applied, input: { seq: 1, type: 'a/b' } })],
    ['an applied with an input with no type', json({ ...applied, input: { seq: 1, source: 'a' } })],
    ['an applied with no parts', json({ ...applied, parts: undefined })],
    ['an applied with parts that are a list', json({ ...applied, parts: [] })],
    ['a result with no request', json({ ...result, request: undefined })],
    ['a result with no result and no error', json({ t: 'result', request: 1 })],
    ['a result with a result that is not an object', json({ t: 'result', request: 1, result: 'ok' })],
    ['a result with a result with no ok', json({ t: 'result', request: 1, result: {} })],
    ['a result with an error that is not text', json({ t: 'result', request: 1, error: 5 })],
    [
      'a result with a result and an error',
      json({ t: 'result', request: 1, result: { ok: true, seq: 4 }, error: 'It broke.' }),
    ],
    [
      'a result with a result and an error that is null',
      json({ t: 'result', request: 1, result: { ok: true, seq: 4 }, error: null }),
    ],
    ['a result with a request of 1.5', json({ ...result, request: 1.5 })],
    ['a result with a negative request', json({ ...result, request: -1 })],
    ['a welcome with a seq of 3.5', json({ ...welcome, seq: 3.5 })],
    ['a welcome with a negative seq', json({ ...welcome, seq: -1 })],
    ['a welcome with a protocol of 1.5', json({ ...welcome, protocol: 1.5 })],
    ['a welcome with the status stopped', json({ ...welcome, status: 'stopped' })],
    ['an applied with an input with a seq of 4.5', json({ ...applied, input: { ...applied.input, seq: 4.5 } })],
    ['an applied with an input with a negative seq', json({ ...applied, input: { ...applied.input, seq: -1 } })],
  ])('gives undefined for %s', (_name, text) => {
    expect(parseHubMessage(text)).toBeUndefined()
  })

  it('marks a message with an unknown type', () => {
    expect(parseHubMessage(json({ t: 'future-thing' }))).toEqual({ kind: 'unknown', t: 'future-thing' })
  })

  it.each([
    ['welcome', welcome],
    ['refused', refused],
    ['event', event],
    ['applied', applied],
    ['result', result],
  ])('reads a %s that has more keys, one of them named unknown', (_type, message) => {
    for (const extra of [{ unknown: true }, { unknown: false }, { other: 1 }]) {
      const withExtra = { ...message, ...extra }
      expect(parseHubMessage(json(withExtra))).toEqual({ kind: 'message', message: withExtra })
    }
  })

  it.each(['apply', 'part'])('marks the reserved type %s as unknown', (t) => {
    expect(parseHubMessage(json({ t }))).toEqual({ kind: 'unknown', t: t })
  })
})
