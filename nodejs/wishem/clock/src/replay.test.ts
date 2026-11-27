import { createHub, REWIND_INPUT_TYPE, hubInputs, type HubOptions, type JoinedState } from '@thrashplay/wishem-hub'
import { createStore, isEqual, storeInputs, type Model } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import { startClock } from './clock.js'
import { TIME_ID, createTime, timeInputs } from './time.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const ENT2 = 'e_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const model: Model = {
  definitions: [{ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: ENT, components: { [CT]: { [FLD]: 'Wishem' } } }],
}

const subsystems = () => [createStore({ model }), createTime()]

const store = (state: JoinedState): Model => state.store as Model

/** Runs the inputs of the scenario on a hub with a clock, and keeps the joined state after each input. */
const run = (options: Pick<HubOptions, 'checkpointInterval' | 'recordLimit'>, rewindTarget: number) => {
  let callback: (() => void) | undefined
  let time = 0
  const hub = createHub({ subsystems: subsystems(), ...options })
  const clockPort = hub.attach({ id: 'clock', kind: 'input' })
  const controls = hub.attach({ id: 'controls', kind: 'input' })
  hub.start()
  startClock(clockPort, {
    timer: {
      start: (cb) => {
        callback = cb
        return () => undefined
      },
    },
    now: () => time,
  })
  const states = new Map<number, JoinedState>([[0, hub.read()]])
  const keep = () => {
    states.set(hub.seq, hub.read())
  }
  const send = async (input: Parameters<typeof controls.submit>[0]) => {
    const result = await controls.submit(input)
    expect(result.ok).toBe(true)
    keep()
  }
  const tick = async () => {
    time += 50
    callback?.()
    await Promise.resolve()
    keep()
  }

  return (async () => {
    await send(storeInputs().addEntity({ id: ENT2, components: { [CT]: { [FLD]: 'Second' } } }))
    await send(storeInputs().setField({ entity: ENT2, componentType: CT, field: FLD, value: 'Changed' }))
    await tick()
    await tick()
    await send(timeInputs.setRunning(false))
    await send(timeInputs.setRunning(true))
    await tick()
    // A store input after each rewind target, so the store before a rewind differs from the store at the target
    await send(storeInputs().setField({ entity: ENT2, componentType: CT, field: FLD, value: 'Late' }))
    const before = hub.read()
    await send(hubInputs.rewind(rewindTarget))
    const afterRewind = hub.read()
    await send(storeInputs().setField({ entity: ENT, componentType: CT, field: FLD, value: 'After' }))
    await tick()
    await tick()
    return { hub, states, before, afterRewind, target: states.get(rewindTarget) }
  })()
}

const expectSameState = (a: JoinedState, b: JoinedState) => {
  expect(isEqual(store(a), store(b))).toBe(true)
  expect(a[TIME_ID]).toEqual(b[TIME_ID])
}

const expectRewindDiscriminates = (before: JoinedState, target: JoinedState) => {
  expect(isEqual(store(before), store(target))).toBe(false)
  expect(before[TIME_ID]).not.toEqual(target[TIME_ID])
}

describe('a replay with the store and the time subsystem', () => {
  it('returns to the state at the target after a rewind', async () => {
    const { before, afterRewind, target, hub } = await run({}, 3)
    expect(target).toBeDefined()
    expectRewindDiscriminates(before, target!)
    expectSameState(afterRewind, target!)
    expect(hub.record().some((input) => input.type === REWIND_INPUT_TYPE)).toBe(true)
  })

  it('gives the same joined state and the same seq in a new hub with the record of the first hub', async () => {
    const { hub } = await run({}, 3)
    const copy = createHub({ subsystems: subsystems(), record: { start: hub.recordStart(), inputs: hub.record() } })
    expectSameState(copy.read(), hub.read())
    expect(copy.seq).toBe(hub.seq)
  })

  it('replays a record with a start that is not 0 and holds a rewind', async () => {
    const { hub, before, afterRewind, target } = await run({ checkpointInterval: 3, recordLimit: 6 }, 6)
    expect(target).toBeDefined()
    expectRewindDiscriminates(before, target!)
    expectSameState(afterRewind, target!)
    expect(hub.recordStart().seq).toBeGreaterThan(0)
    expect(hub.record().some((input) => input.type === REWIND_INPUT_TYPE)).toBe(true)
    const copy = createHub({ subsystems: subsystems(), record: { start: hub.recordStart(), inputs: hub.record() } })
    expectSameState(copy.read(), hub.read())
    expect(copy.seq).toBe(hub.seq)
    expect(copy.recordStart().seq).toBe(hub.recordStart().seq)
  })
})
