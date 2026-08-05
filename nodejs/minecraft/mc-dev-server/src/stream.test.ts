import { describe, expect, it } from 'vitest'

import { createOutputStream } from './stream.js'

describe('the tagged output stream', () => {
  // d-5e00ndwi — one stream, every line prefixed with its source tag
  it('prefixes every line with its source', () => {
    const lines: string[] = []
    const stream = createOutputStream((line) => lines.push(line))

    stream.write('server', 'Pack Stack - None\n')
    stream.write('deploy', 'reconciled 2 packs\n')
    stream.write('@scope/pack-one', 'build finished\n')

    expect(lines).toEqual([
      '[server] Pack Stack - None',
      '[deploy] reconciled 2 packs',
      '[@scope/pack-one] build finished',
    ])
  })

  it('splits a chunk carrying several lines', () => {
    const lines: string[] = []
    createOutputStream((line) => lines.push(line)).write('server', 'one\ntwo\n')

    expect(lines).toEqual(['[server] one', '[server] two'])
  })
})
