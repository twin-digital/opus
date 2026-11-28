import { useRef, type KeyboardEvent } from 'react'
import { Button } from './Button.js'
import type { RunControl, RunState } from './run-bar-types.js'

export interface RunBarProps {
  state: RunState
  /** The control that waits for its outcome. */
  busy?: RunControl
  /** The text of the line with the role alert. */
  alert?: string
  onControl?: (control: RunControl) => void
}

const statusClass: Record<RunState['status'], string> = {
  Running: 'text-success-text',
  Paused: 'text-warning-text',
  Failed: 'text-danger-text',
  'Not running': 'text-fg-muted',
  Starting: 'text-fg-muted',
  Stopped: 'text-fg-muted',
}

const labelClass = 'font-mono text-label font-medium uppercase'

/** The toolbar that runs, pauses, and steps the product, with its status and its readout. */
export const RunBar = ({ state, busy, alert, onControl }: RunBarProps) => {
  const bar = useRef<HTMLDivElement>(null)
  const { status, enabled, readout } = state
  const active = status === 'Starting' || status === 'Running' || status === 'Paused'
  const controls: { control: RunControl; label: string; maker?: boolean }[] = [
    active ? { control: 'stop', label: 'Stop' } : { control: 'run', label: 'Run', maker: true },
    status === 'Paused' ? { control: 'resume', label: 'Resume', maker: true } : { control: 'pause', label: 'Pause' },
    { control: 'step', label: 'Step' },
    { control: 'back', label: 'Step back' },
  ]
  const found = controls.findIndex(({ control }) => enabled.has(control))
  const stop = Math.max(found, 0)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(bar.current?.querySelectorAll('button') ?? []).filter(
      (button) => button.getAttribute('aria-disabled') !== 'true',
    )
    if (items.length === 0) {
      return
    }
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    if (event.key === 'ArrowRight') {
      next = (at + 1) % items.length
    } else if (event.key === 'ArrowLeft') {
      next = at <= 0 ? items.length - 1 : at - 1
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = items.length - 1
    } else {
      return
    }
    event.preventDefault()
    items[next]?.focus()
  }

  return (
    <div className='grid gap-2'>
      <div
        ref={bar}
        role='toolbar'
        aria-label='Product controls'
        onKeyDown={onKeyDown}
        className='flex flex-wrap items-center gap-x-3 gap-y-2'
      >
        <span className={`${labelClass} text-fg`}>Product</span>
        <span role='status' className={`${labelClass} ${statusClass[status]}`}>
          {status}
        </span>
        <div className='flex basis-full flex-wrap items-center gap-2'>
          {controls.map(({ control, label, maker }, index) => (
            <Button
              key={index}
              label={label}
              variant={maker ? 'maker' : 'plain'}
              disabled={!enabled.has(control)}
              busy={busy === control}
              tabIndex={index === stop ? 0 : -1}
              onPress={() => onControl?.(control)}
            />
          ))}
          {readout && (
            <>
              <span className={`${labelClass} text-fg-muted`}>Tick {readout.ticks}</span>
              <span className={`${labelClass} text-fg-muted`}>{readout.seconds} s</span>
            </>
          )}
        </div>
      </div>
      {alert !== undefined && alert !== '' && (
        <p role='alert' className='text-ui text-danger-text'>
          {alert}
        </p>
      )}
    </div>
  )
}
