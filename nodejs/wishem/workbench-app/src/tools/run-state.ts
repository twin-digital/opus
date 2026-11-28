import type { TimePart } from '@thrashplay/wishem-clock'
import type { ConstructEntry } from '@thrashplay/wishem-construct-manager'
import type { RunControl, RunState } from '../components/run-bar-types.js'

export interface RunStateArgs {
  entry?: ConstructEntry
  /** The part `time` of the stage link. */
  time?: TimePart
  /** True when the page has an input port. */
  canSend: boolean
}

const statusOf = (entry: ConstructEntry | undefined): RunState['status'] => {
  if (!entry) {
    return 'Not running'
  }
  if (entry.status === 'failed') {
    return 'Failed'
  }
  if (entry.want === 'stopped' || entry.status === 'stopped') {
    return 'Stopped'
  }
  if (entry.status === 'pending') {
    return 'Starting'
  }
  return entry.time === 'paused' ? 'Paused' : 'Running'
}

/** The status, the enabled controls, and the readout of the run controls. */
export const runState = ({ entry, time, canSend }: RunStateArgs): RunState => {
  const status = statusOf(entry)
  const enabled = new Set<RunControl>()
  if (canSend) {
    if (status === 'Not running' || status === 'Stopped' || status === 'Failed') {
      enabled.add('run')
    } else {
      enabled.add('stop')
    }
    if (status === 'Running') {
      enabled.add('pause')
    }
    if (status === 'Paused') {
      enabled.add('resume')
      if (time) {
        enabled.add('step')
        if (time.ticks > 0) {
          enabled.add('back')
        }
      }
    }
  }
  const state: RunState = { status, enabled }
  if (status === 'Failed' && entry?.message !== undefined) {
    state.message = entry.message
  }
  if (time) {
    state.readout = { ticks: time.ticks, seconds: (time.now / 1000).toFixed(2) }
  }
  return state
}
