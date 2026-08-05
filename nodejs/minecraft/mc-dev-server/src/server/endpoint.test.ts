import { describe, expect, it } from 'vitest'

import { connectionLine, endpointHostOf } from './endpoint.js'

describe('the connection endpoint', () => {
  // d-a3fyy34f — the connection is whatever the environment already selected
  it.each([
    ['ssh://someone@builder.example', 'builder.example'],
    ['tcp://10.0.0.5:2375', '10.0.0.5'],
    ['unix:///var/run/docker.sock', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('takes the host out of %s', (dockerHost, expected) => {
    expect(endpointHostOf(dockerHost)).toBe(expected)
  })

  // r-whacwz1b — a remote daemon publishes the port on the remote host, not on this one
  it('reports the remote host and the published port', () => {
    expect(connectionLine(19140, 'ssh://someone@builder.example')).toContain('builder.example:19140')
  })

  it('reports localhost and the context where no connection is set', () => {
    expect(connectionLine(19132, undefined)).toContain('localhost:19132')
    expect(connectionLine(19132, undefined)).toContain('active Docker context')
  })
})
