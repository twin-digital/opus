// Replays a record in a new hub, replays a record that fails, and shows the reserved ID.
// Usage: node replay-demo.mjs
// This file is the package '@thrashplay/wishem-hub', after its build.
import { createHub, HubConfigurationError, hubInputs, InputRefusedError, ReplayError } from '../../../hub/dist/index.js'

const makeCounter = (limit) => ({
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => {
    if (input.payload.by > limit) {
      throw new InputRefusedError([{ message: `The number is larger than ${limit}.`, path: ['payload', 'by'] }])
    }
    return { count: part.count + input.payload.by }
  },
})

// The first hub: three adds, a rewind to the first add, and one more add.
const first = createHub({ subsystems: [makeCounter(10)] })
const port = first.attach({ id: 'buttons', kind: 'input' })
first.start()
await port.submit({ type: 'counter/add', payload: { by: 1 } })
await port.submit({ type: 'counter/add', payload: { by: 5 } })
await port.submit({ type: 'counter/add', payload: { by: 5 } })
await port.submit(hubInputs.rewind(1))
await port.submit({ type: 'counter/add', payload: { by: 2 } })
const record = { start: first.recordStart(), inputs: first.record() }
console.log('record:', record.inputs.map((input) => `${input.seq} ${input.type}`).join(', '))
console.log('first hub:', JSON.stringify(first.read()), `seq ${first.seq}`)

// The second hub gets the record, and applies it again before createHub returns.
const second = createHub({ subsystems: [makeCounter(10)], record })
console.log('replayed hub:', JSON.stringify(second.read()), `seq ${second.seq}`, second.status)
console.log('same record:', JSON.stringify(second.record()) === JSON.stringify(first.record()))

// The new hub continues with the next sequence number.
second.start()
const next = second.attach({ id: 'buttons', kind: 'input' })
console.log('next input:', JSON.stringify(await next.submit({ type: 'counter/add', payload: { by: 1 } })))
second.stop()

// A replay with a subsystem that refuses the input 2 (the number 5 is larger than 4).
try {
  createHub({ subsystems: [makeCounter(4)], record })
} catch (error) {
  console.log('replay failed:', error instanceof ReplayError, `at seq ${error.seq}`, JSON.stringify(error.problems))
}

// The ID and the types `hub/...` belong to the hub.
try {
  createHub({ subsystems: [{ id: 'hub', inputs: [], initial: {}, apply: (part) => part }] })
} catch (error) {
  console.log('subsystem with the ID hub:', error instanceof HubConfigurationError, '-', error.message)
}
try {
  createHub({ subsystems: [{ id: 'extra', inputs: ['hub/extra'], initial: {}, apply: (part) => part }] })
} catch (error) {
  console.log('subsystem with a hub/ type:', error instanceof HubConfigurationError, '-', error.message)
}
try {
  first.attach({ id: 'hub', kind: 'input' })
} catch (error) {
  console.log('attach with the ID hub:', error instanceof HubConfigurationError, '-', error.message)
}
const unknown = createHub({ subsystems: [makeCounter(10)] })
const unknownPort = unknown.attach({ id: 'buttons', kind: 'input' })
unknown.start()
console.log('hub/other:', JSON.stringify(await unknownPort.submit({ type: 'hub/other' })))
unknown.stop()
first.stop()
