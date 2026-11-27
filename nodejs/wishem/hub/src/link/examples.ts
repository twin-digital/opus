import type { ClientMessage, HubMessage } from './messages.js'

/** The messages of the full example in `LINK.md`. Each JSON block of that document is one of these values. */
export const examples = {
  hello: {
    t: 'hello',
    protocol: 1,
    subsystems: [
      { id: 'page', kind: 'output' },
      { id: 'page-controls', kind: 'input' },
    ],
  },
  welcome: { t: 'welcome', protocol: 1, status: 'running', seq: 3, state: { counter: { count: 6 } } },
  submit: {
    t: 'submit',
    request: 1,
    subsystem: 'page-controls',
    input: { type: 'counter/add', payload: { by: 2 } },
  },
  applied: {
    t: 'applied',
    input: { seq: 4, source: 'page-controls', type: 'counter/add', payload: { by: 2 } },
    parts: { counter: { count: 8 } },
  },
  result: { t: 'result', request: 1, result: { ok: true, seq: 4 } },
  rejected: {
    t: 'result',
    request: 2,
    result: {
      ok: false,
      reason: 'invalid',
      problems: [{ message: 'The number is negative.', path: ['payload', 'by'] }],
    },
  },
  failed: { t: 'result', request: 3, error: 'The model subsystem failed.' },
  started: { t: 'event', event: 'started' },
  stopping: { t: 'event', event: 'stopping' },
  refused: {
    t: 'refused',
    reason: 'version',
    message: 'The hub supports protocol version 1, not 2.',
    supported: [1],
  },
} satisfies Record<string, ClientMessage | HubMessage>
