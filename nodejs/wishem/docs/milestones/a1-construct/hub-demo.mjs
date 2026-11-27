// A hub with one model subsystem, a counter. Shows the ports, the events, the results, and the record.
// Usage: node hub-demo.mjs
// This file is the package '@thrashplay/wishem-hub', after its build.
import { createHub, InputRefusedError } from '../../../hub/dist/index.js'

const counter = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => {
    const by = input.payload?.by
    if (typeof by !== 'number' || by < 0) {
      throw new InputRefusedError([{ message: 'The number is negative or missing.', path: ['payload', 'by'] }])
    }
    return { count: part.count + by }
  },
}

const hub = createHub({ subsystems: [counter] })
const buttons = hub.attach({ id: 'buttons', kind: 'input' })
const screen = hub.attach({ id: 'screen', kind: 'output' })
screen.subscribe((event) => {
  console.log('event:', event.type, event.type === 'applied' ? JSON.stringify(screen.read()) : '')
})

console.log('before start:', JSON.stringify(await buttons.submit({ type: 'counter/add', payload: { by: 1 } })))
hub.start()
console.log('accepted:', JSON.stringify(await buttons.submit({ type: 'counter/add', payload: { by: 2 } })))
console.log('from an output port:', JSON.stringify(await screen.submit({ type: 'counter/add', payload: { by: 2 } })))
console.log('unknown type:', JSON.stringify(await buttons.submit({ type: 'counter/remove' })))
console.log('invalid:', JSON.stringify(await buttons.submit({ type: 'counter/add', payload: { by: -1 } })))
console.log('record:', JSON.stringify(hub.record()))
hub.stop()
