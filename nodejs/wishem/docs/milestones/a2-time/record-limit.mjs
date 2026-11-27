// A hub with a record limit. Shows how the start of the record moves.
// Usage: node record-limit.mjs
// This file is the package '@thrashplay/wishem-hub', after its build.
import { createHub, hubInputs } from '../../../hub/dist/index.js'

const counter = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => ({ count: part.count + input.payload.by }),
}

// A checkpoint after each 2 inputs. At most 4 inputs after the start of the record.
const hub = createHub({ subsystems: [counter], checkpointInterval: 2, recordLimit: 4 })
const port = hub.attach({ id: 'buttons', kind: 'input' })
hub.start()

const show = () =>
  console.log(
    `seq ${hub.seq}: start ${hub.recordStart().seq} (count ${hub.recordStart().state.counter.count}),`,
    `record [${hub
      .record()
      .map((input) => input.seq)
      .join(', ')}]`,
  )

show()
for (let i = 1; i <= 7; i++) {
  await port.submit({ type: 'counter/add', payload: { by: 1 } })
  show()
}

console.log('rewind to 3:', JSON.stringify(await port.submit(hubInputs.rewind(3))))
console.log('rewind to 4:', JSON.stringify(await port.submit(hubInputs.rewind(4))))
console.log('count now', port.read().counter.count)
show()
hub.stop()
