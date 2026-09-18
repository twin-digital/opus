import { describe, expect, it, vi } from 'vitest'

import { ReaperClient, parseReaperReply } from './reaper-client.js'

const reply = [
  'TRANSPORT\t5\t12.5\t0\t0:12.500\t3.1.00',
  'REGION\tTake 1 - Sep 17\t1\t0\t10\t0',
  'REGION\tTake 2 - Sep 17\t2\t12\t20.5\t0',
  'TRACK\t0\tMASTER\t0\t1\t0\t-3\t-3',
  'TRACK\t1\tPiano\t0\t1\t0\t-18.5\t-18.5',
  'TRACK\t2\tVocal\t0\t1\t0\t-9\t-9',
].join('\n')

describe('parseReaperReply', () => {
  it('decodes transport, regions, and the loudest non-master peak', () => {
    const status = parseReaperReply(reply)

    expect(status.playState).toBe('recording')
    expect(status.position).toBe(12.5)
    expect(status.regions).toEqual([
      { id: '1', name: 'Take 1 - Sep 17', start: 0, end: 10 },
      { id: '2', name: 'Take 2 - Sep 17', start: 12, end: 20.5 },
    ])
    expect(status.peakDb).toBe(-9)
  })

  it.each([
    ['0', 'stopped'],
    ['1', 'playing'],
    ['2', 'paused'],
    ['5', 'recording'],
    ['6', 'recording'],
  ])('maps playstate %s to %s', (flags, expected) => {
    expect(parseReaperReply(`TRANSPORT\t${flags}\t0\t0\t0\t0`).playState).toBe(expected)
  })

  it('returns an idle status for an empty reply', () => {
    expect(parseReaperReply('')).toEqual({ playState: 'stopped', position: 0, regions: [], peakDb: -Infinity })
  })
})

describe('ReaperClient', () => {
  const makeClient = () => {
    const fetchImpl = vi.fn((_url: string) => Promise.resolve({ ok: true, text: () => Promise.resolve('') }))
    return { client: new ReaperClient({ baseUrl: 'http://reaper:8080/', fetch: fetchImpl }), fetchImpl }
  }

  it('joins commands into a single ordered request', async () => {
    const { client, fetchImpl } = makeClient()
    await client.playFrom(12)
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith('http://reaper:8080/_/1016;SET/POS/12.000;1007')
  })

  it('records at the project end when no position is given', async () => {
    const { client, fetchImpl } = makeClient()
    await client.recordAt()
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith('http://reaper:8080/_/1016;40043;1013')
  })

  it('rejects when REAPER answers with an error', async () => {
    const client = new ReaperClient({
      fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
    })
    await expect(client.getStatus()).rejects.toThrow(/web remote/)
  })
})
