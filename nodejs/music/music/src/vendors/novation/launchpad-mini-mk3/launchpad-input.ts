import type { PadEventEmitter } from '../../../midi/pad-event.js'
import { Events } from '../../../typed-event-emitter.js'
import { InputRouter } from '../../../ui/input/input-router.js'
import type { NovationLaunchpadMiniMk3 } from './novation-launchpad-mini-mk3.js'

/**
 * @future - uses private launchpad field
 */
const createLaunchpadEventEmitter = (launchpad: NovationLaunchpadMiniMk3): PadEventEmitter => {
  const emitter = new Events() as PadEventEmitter

  launchpad._input.on('noteon', (note) => {
    const y = Math.floor((note.note - 11) / 10)
    const x = note.note - 11 - y * 10

    if (note.velocity === 0) {
      emitter.emit('pad-up', {
        x,
        y,
        type: 'pad-up',
      })
    } else {
      emitter.emit('pad-down', {
        x,
        y,
        type: 'pad-down',
      })
    }
  })

  launchpad._input.on('cc', (cc) => {
    const y = Math.floor((cc.controller - 11) / 10)
    const x = cc.controller - 11 - y * 10

    if (cc.value === 0) {
      emitter.emit('pad-up', {
        x,
        y,
        type: 'pad-up',
      })
    } else {
      emitter.emit('pad-down', {
        x,
        y,
        type: 'pad-down',
      })
    }
  })

  return emitter
}

export const makeLaunchpadInputRouter = (launchpad: NovationLaunchpadMiniMk3): InputRouter => {
  const inputRouter = new InputRouter()
  const events = createLaunchpadEventEmitter(launchpad)

  events.on('pad-down', (event) => {
    console.log('handle', JSON.stringify(event))
    inputRouter.handle(event)
  })

  events.on('pad-up', (event) => {
    console.log('handle', JSON.stringify(event))
    inputRouter.handle(event)
  })

  return inputRouter
}
