export type RunControl = 'run' | 'stop' | 'pause' | 'resume' | 'step' | 'back'

export interface RunState {
  status: 'Not running' | 'Starting' | 'Running' | 'Paused' | 'Stopped' | 'Failed'
  message?: string
  /** The controls that are enabled. */
  enabled: ReadonlySet<RunControl>
  /** With no value, the run bar shows no readout. */
  readout?: { ticks: number; seconds: string }
}
