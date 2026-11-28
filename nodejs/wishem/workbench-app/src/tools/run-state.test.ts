import type { ConstructEntry } from '@thrashplay/wishem-construct-manager'
import { describe, expect, it } from 'vitest'
import type { RunControl } from '../components/run-bar-types.js'
import { runState } from './run-state.js'

const entry = (patch: Partial<ConstructEntry> = {}): ConstructEntry => ({
  want: 'running',
  startTime: 'running',
  startSeq: 1,
  status: 'running',
  link: 'ws://127.0.0.1:1/link',
  time: 'running',
  ...patch,
})
const time = (ticks: number, running = true) => ({ now: ticks * 50, ticks, running })
const enabled = (...controls: RunControl[]) => new Set(controls)

describe('runState', () => {
  it('has the status Not running and only Run with no entry', () => {
    const state = runState({ canSend: true })
    expect(state.status).toBe('Not running')
    expect(state.enabled).toEqual(enabled('run'))
    expect(state.readout).toBeUndefined()
  })

  it('has the status Starting and only Stop for the status pending', () => {
    const state = runState({ entry: entry({ status: 'pending', link: undefined, time: undefined }), canSend: true })
    expect(state.status).toBe('Starting')
    expect(state.enabled).toEqual(enabled('stop'))
  })

  it('has the status Running with Stop and Pause while the time state is running', () => {
    const state = runState({ entry: entry(), time: time(3), canSend: true })
    expect(state.status).toBe('Running')
    expect(state.enabled).toEqual(enabled('stop', 'pause'))
  })

  it('has the status Paused with Stop, Resume, Step, and Step back', () => {
    const state = runState({ entry: entry({ time: 'paused' }), time: time(3, false), canSend: true })
    expect(state.status).toBe('Paused')
    expect(state.enabled).toEqual(enabled('stop', 'resume', 'step', 'back'))
  })

  it('disables Step back at the tick 0', () => {
    const state = runState({ entry: entry({ time: 'paused' }), time: time(0, false), canSend: true })
    expect(state.enabled).toEqual(enabled('stop', 'resume', 'step'))
  })

  it('disables Step and Step back when the stage link has no part time', () => {
    const state = runState({ entry: entry({ time: 'paused' }), canSend: true })
    expect(state.enabled).toEqual(enabled('stop', 'resume'))
    expect(state.readout).toBeUndefined()
  })

  it('has the status Stopped and only Run when the entry is wanted to stop', () => {
    const state = runState({ entry: entry({ want: 'stopped' }), canSend: true })
    expect(state.status).toBe('Stopped')
    expect(state.enabled).toEqual(enabled('run'))
  })

  it('has the status Stopped and only Run for the status stopped', () => {
    const state = runState({ entry: entry({ status: 'stopped', time: undefined }), canSend: true })
    expect(state.status).toBe('Stopped')
    expect(state.enabled).toEqual(enabled('run'))
  })

  it('has the status Failed with the message and only Run', () => {
    const state = runState({
      entry: entry({ status: 'failed', message: 'Two behaviors have the ID a.', link: undefined, time: undefined }),
      canSend: true,
    })
    expect(state.status).toBe('Failed')
    expect(state.message).toBe('Two behaviors have the ID a.')
    expect(state.enabled).toEqual(enabled('run'))
  })

  it('gives the readout Tick 42 and 2.10 s', () => {
    const state = runState({ entry: entry({ time: 'paused' }), time: time(42, false), canSend: true })
    expect(state.readout).toEqual({ ticks: 42, seconds: '2.10' })
  })

  it('gives the seconds with two decimals', () => {
    const state = runState({ entry: entry(), time: { now: 0, ticks: 0, running: true }, canSend: true })
    expect(state.readout?.seconds).toBe('0.00')
  })

  it('disables each control with no input port', () => {
    for (const patch of [{}, { time: 'paused' as const }, { want: 'stopped' as const }]) {
      const state = runState({ entry: entry(patch), time: time(3, false), canSend: false })
      expect(state.enabled.size).toBe(0)
    }
    expect(runState({ canSend: false }).enabled.size).toBe(0)
  })

  it('keeps the status when no input port exists', () => {
    expect(runState({ entry: entry(), canSend: false }).status).toBe('Running')
  })
})
