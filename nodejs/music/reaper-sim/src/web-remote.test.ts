import { describe, expect, it } from 'vitest'
import { ReaperSim } from './simulator.js'

const send = async (sim: ReaperSim, commands: string) => {
  const response = await sim.fetch(`http://reaper/_/${commands}`)
  return { status: response.status, body: await response.text() }
}

describe('web remote', () => {
  it('upper-cases the section and key it writes, and reads them back ignoring case', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/PROJEXTSTATE/thrashplay/req_1/hello%20world')
    expect(sim.model.currentProject.extState.entries('THRASHPLAY')).toEqual([['REQ_1', 'hello world']])
    expect((await send(sim, 'GET/PROJEXTSTATE/thrashplay/Req_1')).body).toBe(
      'PROJEXTSTATE\tthrashplay\tReq_1\thello world\n',
    )
  })

  it('reads keys a script wrote in mixed case', async () => {
    const sim = new ReaperSim()
    sim.model.currentProject.extState.set('Studio', 'project_name', 'Piano Corner')
    expect((await send(sim, 'GET/PROJEXTSTATE/Studio/project_name')).body).toBe(
      'PROJEXTSTATE\tStudio\tproject_name\tPiano Corner\n',
    )
  })

  it('writes project ext state to the current project', async () => {
    const sim = new ReaperSim()
    const first = sim.model.currentProject
    const second = sim.model.openProject('/songs/b.rpp')
    await send(sim, 'SET/PROJEXTSTATE/THRASHPLAY/K/v')
    expect(second.extState.get('THRASHPLAY', 'K')).toBe('v')
    expect(first.extState.get('THRASHPLAY', 'K')).toBeUndefined()
  })

  it('reads and writes global ext state', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/EXTSTATE/thrashplay/a/1;SET/EXTSTATEPERSIST/thrashplay/b/2')
    expect(sim.model.globalExtState.entries('THRASHPLAY')).toEqual([
      ['A', '1'],
      ['B', '2'],
    ])
    expect((await send(sim, 'GET/EXTSTATE/THRASHPLAY/A;GET/EXTSTATE/THRASHPLAY/missing')).body).toBe(
      'EXTSTATE\tTHRASHPLAY\tA\t1\nEXTSTATE\tTHRASHPLAY\tmissing\t\n',
    )
  })

  it('looks keys up as sent, without decoding them', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/PROJEXTSTATE/THRASHPLAY/KEY%3DEQUALS/1;SET/PROJEXTSTATE/THRASHPLAY/KEY.DOT/2')
    expect(sim.model.currentProject.extState.entries('THRASHPLAY')).toEqual([
      ['KEY.DOT', '2'],
      ['KEY=EQUALS', '1'],
    ])
    expect((await send(sim, 'GET/PROJEXTSTATE/THRASHPLAY/KEY%3DEQUALS;GET/PROJEXTSTATE/THRASHPLAY/KEY.DOT')).body).toBe(
      'PROJEXTSTATE\tTHRASHPLAY\tKEY%3DEQUALS\t\nPROJEXTSTATE\tTHRASHPLAY\tKEY.DOT\t2\n',
    )
  })

  it('deletes a key written empty', async () => {
    const sim = new ReaperSim()
    await send(sim, 'SET/PROJEXTSTATE/THRASHPLAY/K/v;SET/PROJEXTSTATE/THRASHPLAY/K/')
    expect(sim.model.currentProject.extState.entries('THRASHPLAY')).toEqual([])
  })

  it('keeps encoded slashes and semicolons inside a value', async () => {
    const sim = new ReaperSim()
    await send(sim, `SET/PROJEXTSTATE/THRASHPLAY/K/${encodeURIComponent('{"a":"x/y;z"}')}`)
    expect(sim.model.currentProject.extState.get('THRASHPLAY', 'K')).toBe('{"a":"x/y;z"}')
  })

  it('escapes tabs, newlines and backslashes in replies', async () => {
    const sim = new ReaperSim()
    sim.model.globalExtState.set('THRASHPLAY', 'K', 'a\tb\nc\\d')
    expect((await send(sim, 'GET/EXTSTATE/THRASHPLAY/K')).body).toBe('EXTSTATE\tTHRASHPLAY\tK\ta\\tb\\nc\\\\d\n')
  })

  it('cuts each command off at 1023 characters as sent, and answers as usual', async () => {
    const sim = new ReaperSim()
    const prefix = 'SET/EXTSTATE/THRASHPLAY/K/'
    const reply = await send(sim, `${prefix}${'x'.repeat(2000)};SET/EXTSTATE/THRASHPLAY/NEXT/ok`)
    expect(reply.status).toBe(200)
    expect(sim.model.globalExtState.get('THRASHPLAY', 'K')).toHaveLength(1023 - prefix.length)
    expect(sim.model.globalExtState.get('THRASHPLAY', 'NEXT')).toBe('ok')
  })

  it('counts encoded characters toward the limit, and decodes a cut-off character as a replacement', async () => {
    const sim = new ReaperSim()
    // 30 + 165 × 6 (%C3%A9) = 1020, so the cut leaves %C3 of the 166th é
    const prefix = 'SET/EXTSTATE/THRASHPLAY/KEYYY/'
    await send(sim, `${prefix}${encodeURIComponent('é'.repeat(200))}`)
    expect(sim.model.globalExtState.get('THRASHPLAY', 'KEYYY')).toBe(`${'é'.repeat(165)}\uFFFD`)
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
