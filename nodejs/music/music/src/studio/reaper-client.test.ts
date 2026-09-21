import { describe, expect, it, vi } from 'vitest'

import { ReaperClient, parseReaperReply } from './reaper-client.js'

const reply = [
  'TRANSPORT\t5\t12.5\t0\t0:12.500\t3.1.00',
  'REGION\tTake 1 - Sep 17\t1\t0\t10\t0',
  'REGION\tTake 2 - Sep 17\t2\t12\t20.5\t0',
  // peaks are tenths of a dB
  'TRACK\t0\tMASTER\t0\t1\t0\t-30\t-30',
  'TRACK\t1\tPiano\t0\t1\t0\t-185\t-185',
  'TRACK\t2\tVocal\t0\t1\t0\t-90\t-90',
  'PROJEXTSTATE\tStudio\tproject_name\tPiano Corner',
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
    expect(status.projectName).toBe('Piano Corner')
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

  it('drops regions with unparseable bounds and defaults a bad position to 0', () => {
    const status = parseReaperReply('TRANSPORT\t1\tabc\t0\t0\t0\nREGION\tBroken\t3\t5\nREGION\tOk\t4\t1\t2\t0')
    expect(status.position).toBe(0)
    expect(status.regions.map((r) => r.id)).toEqual(['4'])
  })

  it('returns an idle status for an empty reply', () => {
    expect(parseReaperReply('')).toEqual({
      playState: 'stopped',
      position: 0,
      regions: [],
      peakDb: -Infinity,
      projectName: '',
    })
  })
})

describe('ReaperClient', () => {
  const makeClient = (timeoutMs?: number) => {
    const fetchImpl = vi.fn((_url: string, _init: { signal: AbortSignal }) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve('') }),
    )
    return { client: new ReaperClient({ baseUrl: 'http://reaper:8080//', fetch: fetchImpl, timeoutMs }), fetchImpl }
  }

  it('joins commands into a single ordered request', async () => {
    const { client, fetchImpl } = makeClient()
    await client.playFrom(12)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://reaper:8080/_/1016;SET/POS/12.000;1007')
  })

  it('records at the project end when no position is given', async () => {
    const { client, fetchImpl } = makeClient()
    await client.recordAt()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://reaper:8080/_/1016;40043;1013')
  })

  it('rejects non-finite or negative positions before sending anything', async () => {
    const { client, fetchImpl } = makeClient()
    await expect(client.recordAt(Number.NaN)).rejects.toThrow(/position/)
    await expect(client.playFrom(-1)).rejects.toThrow(/position/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires a base URL with a scheme', () => {
    expect(() => new ReaperClient({ baseUrl: 'localhost:8080' })).toThrow()
    expect(() => new ReaperClient({ baseUrl: 'reaper.local' })).toThrow()
  })

  it('sends every request with a timeout signal', async () => {
    const { client, fetchImpl } = makeClient(20)
    await client.runActions('1016')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const { signal } = fetchImpl.mock.calls[0][1]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(signal.aborted).toBe(true)
  })

  it('rejects when REAPER answers with an error', async () => {
    const client = new ReaperClient({
      fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
    })
    await expect(client.getStatus()).rejects.toThrow(/web remote/)
  })
})
