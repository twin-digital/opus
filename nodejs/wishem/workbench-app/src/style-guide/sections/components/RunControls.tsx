import { Button } from '../../../components/Button.js'
import { RunBar } from '../../../components/RunBar.js'
import type { RunControl, RunState } from '../../../components/run-bar-types.js'
import { StageFrame } from '../../../components/StageFrame.js'
import { Specimen } from '../../Specimen.js'

const controls = (...names: RunControl[]): ReadonlySet<RunControl> => new Set(names)
const runBarStates = {
  notRunning: { status: 'Not running', enabled: controls('run') },
  starting: { status: 'Starting', enabled: controls('stop') },
  running: {
    status: 'Running',
    enabled: controls('stop', 'pause'),
    readout: { ticks: 412, seconds: '20.60' },
  },
  paused: {
    status: 'Paused',
    enabled: controls('stop', 'resume', 'step', 'back'),
    readout: { ticks: 42, seconds: '2.10' },
  },
  pausedAtStart: {
    status: 'Paused',
    enabled: controls('stop', 'resume', 'step'),
    readout: { ticks: 0, seconds: '0.00' },
  },
  failed: { status: 'Failed', enabled: controls('run') },
  noLink: { status: 'Not running', enabled: controls() },
} satisfies Record<string, RunState>

/**
 * The button of the run bar, the run bar, and the stage frame.
 */
export const RunControls = () => (
  <>
    <Specimen label='Button'>
      <div className='p-4'>
        <Button>Step</Button>
      </div>
    </Specimen>
    <Specimen label='Button, maker'>
      <div className='p-4'>
        <Button variant='maker'>Run</Button>
      </div>
    </Specimen>
    <Specimen label='Button, disabled'>
      <div className='p-4'>
        <Button disabled>Step</Button>
      </div>
    </Specimen>
    <Specimen label='Run bar, not running'>
      <div className='p-4'>
        <RunBar state={runBarStates.notRunning} />
      </div>
    </Specimen>
    <Specimen label='Run bar, starting'>
      <div className='p-4'>
        <RunBar state={runBarStates.starting} busy='stop' />
      </div>
    </Specimen>
    <Specimen label='Run bar, running'>
      <div className='p-4'>
        <RunBar state={runBarStates.running} />
      </div>
    </Specimen>
    <Specimen label='Run bar, paused'>
      <div className='p-4'>
        <RunBar state={runBarStates.paused} />
      </div>
    </Specimen>
    <Specimen label='Run bar, paused at the start'>
      <div className='p-4'>
        <RunBar state={runBarStates.pausedAtStart} />
      </div>
    </Specimen>
    <Specimen label='Run bar, failed'>
      <div className='p-4'>
        <RunBar state={runBarStates.failed} alert='Two behaviors have the ID sample-product/count.' />
      </div>
    </Specimen>
    <Specimen label='Run bar, not done'>
      <div className='p-4'>
        <RunBar
          state={runBarStates.pausedAtStart}
          alert='Step back was not done. The construct has no tick to step back.'
        />
      </div>
    </Specimen>
    <Specimen label='Run bar, no link'>
      <div className='p-4'>
        <RunBar state={runBarStates.noLink} />
      </div>
    </Specimen>
    <Specimen label='Stage, not running'>
      <div className='w-[672px] p-4'>
        <StageFrame message='Not running. Press Run to start the product.' />
      </div>
    </Specimen>
    <Specimen label='Stage, connecting'>
      <div className='w-[672px] p-4'>
        <StageFrame message='Connecting to the product.' />
      </div>
    </Specimen>
    <Specimen label='Stage, no views'>
      <div className='w-[672px] p-4'>
        <StageFrame message='The product has no React views.' />
      </div>
    </Specimen>
    <Specimen label='Stage, not reachable'>
      <div className='w-[672px] p-4'>
        <StageFrame note='The product is not reachable. The page tries again.'>
          <div className='h-[180px] w-[320px] bg-accent' />
        </StageFrame>
      </div>
    </Specimen>
    <Specimen label='Stage, a picture'>
      <div className='w-[672px] p-4'>
        <StageFrame>
          <div className='h-[180px] w-[320px] bg-accent' />
          <p className='text-fg'>Count 7</p>
        </StageFrame>
      </div>
    </Specimen>
  </>
)
