import { describe, expect, it } from 'vitest'
import { ReaperSim } from './simulator.js'

const send = async (sim: ReaperSim, commands: string) => {
  const response = await sim.fetch(`http://reaper/_/${commands}`)
  return { status: response.status, body: await response.text() }
}

describe('web remote', () => {
  it('upper-cases the section and key it writes, and reads them back ignoring case', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/PROJEXTSTATE/csst/req_1/hello%20world')
    expect(sim.model.currentProject.extState.entries('CSST')).toEqual([['REQ_1', 'hello world']])
    expect((await send(sim, 'GET/PROJEXTSTATE/csst/Req_1')).body).toBe('PROJEXTSTATE\tcsst\tReq_1\thello world\n')
  })

  it('writes project ext state to the current project', async () => {
    const sim = new ReaperSim()
    const first = sim.model.currentProject
    const second = sim.model.openProject('/songs/b.rpp')
    await send(sim, 'SET/PROJEXTSTATE/CSST/K/v')
    expect(second.extState.get('CSST', 'K')).toBe('v')
    expect(first.extState.get('CSST', 'K')).toBeUndefined()
  })

  it('reads and writes global ext state', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/EXTSTATE/csst/a/1;SET/EXTSTATEPERSIST/csst/b/2')
    expect(sim.model.globalExtState.entries('CSST')).toEqual([
      ['A', '1'],
      ['B', '2'],
    ])
    expect((await send(sim, 'GET/EXTSTATE/CSST/A;GET/EXTSTATE/CSST/missing')).body).toBe(
      'EXTSTATE\tCSST\tA\t1\nEXTSTATE\tCSST\tmissing\t\n',
    )
  })

  it('deletes a key written empty', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/PROJEXTSTATE/CSST/K/v;SET/PROJEXTSTATE/CSST/K/')
    expect(sim.model.currentProject.extState.entries('CSST')).toEqual([])
  })

  it('keeps encoded slashes and semicolons inside a value', async () => {
    const sim = new ReaperSim()
    await send(sim, `SET/PROJEXTSTATE/CSST/K/${encodeURIComponent('{"a":"x/y;z"}')}`)
    expect(sim.model.currentProject.extState.get('CSST', 'K')).toBe('{"a":"x/y;z"}')
  })

  it('escapes tabs, newlines and backslashes in replies', async () => {
    const sim = new ReaperSim()
    sim.model.globalExtState.set('CSST', 'K', 'a\tb\nc\\d')
    expect((await send(sim, 'GET/EXTSTATE/CSST/K')).body).toBe('EXTSTATE\tCSST\tK\ta\\tb\\nc\\\\d\n')
  })

  it('cuts each command off at 1023 characters as sent, and answers as usual', async () => {
    const sim = new ReaperSim()
    const prefix = 'SET/EXTSTATE/CSST/K/'
    const reply = await send(sim, `${prefix}${'x'.repeat(2000)};SET/EXTSTATE/CSST/NEXT/ok`)
    expect(reply.status).toBe(200)
    expect(sim.model.globalExtState.get('CSST', 'K')).toHaveLength(1023 - prefix.length)
    expect(sim.model.globalExtState.get('CSST', 'NEXT')).toBe('ok')
  })

  it('counts encoded characters toward the limit, and decodes a cut-off character as a replacement', async () => {
    const sim = new ReaperSim()
    // 24 + 166 × 6 (%C3%A9) = 1020, so the cut leaves %C3 of the 167th é
    const prefix = 'SET/EXTSTATE/CSST/KEYYY/'
    await send(sim, `${prefix}${encodeURIComponent('é'.repeat(200))}`)
    expect(sim.model.globalExtState.get('CSST', 'KEYYY')).toBe(`${'é'.repeat(166)}\uFFFD`)
  })

  it('rejects commands it does not implement', async () => {
    const sim = new ReaperSim()
    expect(await send(sim, 'TRANSPORT')).toEqual({ status: 501, body: 'Unsupported web remote command: TRANSPORT' })
  })

  it('journals every command', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/EXTSTATE/A/B/c;GET/EXTSTATE/A/B')
    expect(sim.webRequests).toEqual(['SET/EXTSTATE/A/B/c', 'GET/EXTSTATE/A/B'])
  })
})
