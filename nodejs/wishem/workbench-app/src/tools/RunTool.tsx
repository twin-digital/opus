import type { TimePart } from '@thrashplay/wishem-clock'
import { constructInputs, type ConstructList } from '@thrashplay/wishem-construct-manager'
import type { Input } from '@thrashplay/wishem-hub'
import { Renderer, sendInput, type InputPort, type PortReader } from '@thrashplay/wishem-renderer-react'
import { useState, type ReactNode } from 'react'
import { RunBar } from '../components/RunBar.js'
import type { RunControl } from '../components/run-bar-types.js'
import { StageFrame } from '../components/StageFrame.js'
import { outcomeText } from '../outcome-text.js'
import type { ProductViews } from './product-views.js'
import { runState } from './run-state.js'
import { useStageLink } from './use-stage-link.js'
import { usePart } from './use-part.js'

export interface RunToolProps {
  port: PortReader
  /** With no value, each control is disabled. */
  input: InputPort | undefined
  productViews: ProductViews
}

const CONSTRUCT = 'play'
const WAIT_MS = 5000
const DEFAULT_STEP_MS = 50

const LABELS: Record<RunControl, string> = {
  run: 'Run',
  stop: 'Stop',
  pause: 'Pause',
  resume: 'Resume',
  step: 'Step',
  back: 'Step back',
}

const NO_PORT: PortReader = { read: () => ({}), subscribe: () => () => undefined }

const lastSendOf = (port: PortReader) =>
  (port.read().constructs as ConstructList | undefined)?.constructs[CONSTRUCT]?.lastSend

/** Waits until `lastSend` has this sequence number or a larger one, for at most 5 seconds. */
const waitForSend = (port: PortReader, seq: number): Promise<ReturnType<typeof lastSendOf>> =>
  new Promise((resolve) => {
    const done = (): boolean => {
      const last = lastSendOf(port)
      if (last && last.seq >= seq) {
        finish(last)
        return true
      }
      return false
    }
    const timer = setTimeout(() => {
      finish(undefined)
    }, WAIT_MS)
    const unsubscribe = port.subscribe(() => {
      done()
    })
    function finish(value: ReturnType<typeof lastSendOf>) {
      clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    done()
  })

const reasonOf = (result: NonNullable<ReturnType<typeof lastSendOf>>['result']): string => {
  if (result.ok) {
    return ''
  }
  if (result.reason === 'error') {
    return result.message
  }
  return result.problems[0]?.message ?? result.reason
}

/** The run controls and the stage of the product construct `play`. */
export const RunTool = ({ port, input, productViews }: RunToolProps): ReactNode => {
  const constructs = usePart(port, 'constructs') as ConstructList | undefined
  const entry = constructs?.constructs[CONSTRUCT]
  const stage = useStageLink(CONSTRUCT, entry)
  const stagePort = stage.state === 'connected' || stage.state === 'down' ? stage.port : undefined
  const time = usePart(stagePort ?? NO_PORT, 'time') as TimePart | undefined
  const [busy, setBusy] = useState<RunControl>()
  const [line, setLine] = useState<string>()

  const state = runState({ entry, time, canSend: input !== undefined })
  const shown = busy === undefined ? state : { ...state, enabled: new Set<RunControl>() }

  const send = async (control: RunControl, message: Input): Promise<boolean> => {
    const outcome = await sendInput(input, message)
    if (!outcome.ok) {
      setLine(`Not done. ${outcomeText(outcome, 'the product')}`)
      return false
    }
    setLine(undefined)
    if (control === 'run' || control === 'stop') {
      return true
    }
    const last = await waitForSend(port, outcome.seq)
    if (last?.seq === outcome.seq && !last.result.ok) {
      setLine(`${LABELS[control]} was not done. ${reasonOf(last.result)}`)
    }
    return true
  }

  const onControl = (control: RunControl) => {
    if (busy !== undefined || !state.enabled.has(control)) {
      return
    }
    setBusy(control)
    const act = async () => {
      switch (control) {
        case 'run':
          if (entry?.status === 'failed' && !(await send('stop', constructInputs.stop(CONSTRUCT)))) {
            return
          }
          await send('run', constructInputs.start(CONSTRUCT))
          return
        case 'stop':
          await send(control, constructInputs.stop(CONSTRUCT))
          return
        case 'pause':
        case 'resume':
          await send(
            control,
            constructInputs.send(CONSTRUCT, { type: 'time/set-running', payload: { running: control === 'resume' } }),
          )
          return
        case 'step':
          await send(
            control,
            constructInputs.send(CONSTRUCT, {
              type: 'time/advance',
              payload: { ms: time?.stepMs ?? DEFAULT_STEP_MS },
            }),
          )
          return
        case 'back':
          await send(control, constructInputs.rewind({ construct: CONSTRUCT, ticks: 1 }))
      }
    }
    void act().finally(() => {
      setBusy(undefined)
    })
  }

  const frame = ((): ReactNode => {
    if (stage.state === 'off') {
      return entry?.status === 'pending' ?
          <StageFrame message='Connecting to the product.' />
        : <StageFrame message='Not running. Press Run to start the product.' />
    }
    if (stage.state === 'connecting') {
      return <StageFrame message='Connecting to the product.' />
    }
    if (productViews.error !== undefined) {
      return <StageFrame message={productViews.error} />
    }
    if (productViews.views.size === 0) {
      return <StageFrame message='The product has no React views.' />
    }
    if (!stagePort) {
      return <StageFrame message='The product is not reachable. The page tries again.' />
    }
    return (
      <StageFrame note={stage.state === 'down' ? 'The product is not reachable. The page tries again.' : undefined}>
        <Renderer port={stagePort} views={productViews.views} />
      </StageFrame>
    )
  })()

  const alert = line ?? (state.status === 'Failed' ? state.message : undefined)

  return (
    <div className='grid gap-4'>
      <RunBar state={shown} busy={busy} alert={alert} onControl={onControl} />
      {frame}
    </div>
  )
}
