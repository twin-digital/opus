import type { Input, Port } from '@thrashplay/wishem-hub'
import { timeInputs } from '@thrashplay/wishem-clock'
import type { TimePart } from '@thrashplay/wishem-clock'
import { STEP_MS } from './construct/model.js'

/** Sends the input and ignores each rejection and each failure. */
const send = (port: Port, input: Input): void => {
  try {
    port.submit(input).catch(() => undefined)
  } catch {
    // A closed port sends nothing.
  }
}

/** Listens to `keydown` on the target. Returns a function that removes the listener. A second call does nothing. */
export const attachKeys = (target: EventTarget, input: () => Port | undefined): (() => void) => {
  const onKeyDown = (event: Event): void => {
    const key = (event as KeyboardEvent).key
    if (key !== ' ' && key !== '.') {
      return
    }
    if (key === ' ') {
      event.preventDefault()
    }
    const port = input()
    const time = port?.read().time as TimePart | undefined
    if (!port || !time) {
      return
    }
    send(port, key === ' ' ? timeInputs.setRunning(!time.running) : timeInputs.advance(STEP_MS))
  }
  target.addEventListener('keydown', onKeyDown)
  let attached = true
  return () => {
    if (attached) {
      attached = false
      target.removeEventListener('keydown', onKeyDown)
    }
  }
}
