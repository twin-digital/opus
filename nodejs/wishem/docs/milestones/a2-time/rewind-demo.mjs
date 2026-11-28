// A hub with time and a clock. Rewinds to an earlier input and shows the refused rewinds.
// Usage: node rewind-demo.mjs
// These files are the packages '@thrashplay/wishem-hub' and '@thrashplay/wishem-clock', after their build.
import { createHub, hubInputs } from '../../../hub/dist/index.js'
import { createTime, startClock } from '../../../clock/dist/index.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const hub = createHub({ subsystems: [createTime()] })
const controls = hub.attach({ id: 'controls', kind: 'input' })
const clock = startClock(hub.attach({ id: 'clock', kind: 'input' }), { stepMs: 100 })
const show = (label) => console.log(`${label}:`, JSON.stringify(controls.read().time), `seq ${hub.seq}`)

// Print each rewind that the hub applies.
controls.subscribe((event) => {
  if (event.type === 'applied' && event.input.type === 'hub/rewind') {
    console.log(`event applied #${event.input.seq} ${event.input.type}`, JSON.stringify(event.input.payload))
  }
})

hub.start()
await sleep(850)
show('before the rewind')

console.log('rewind to 3:', JSON.stringify(await controls.submit(hubInputs.rewind(3))))
show('right after the rewind')
await sleep(250)
show('250 ms after the rewind')

const last = hub.seq
console.log('after the present:', JSON.stringify(await controls.submit(hubInputs.rewind(last + 1))))
console.log('not an integer:', JSON.stringify(await controls.submit(hubInputs.rewind(1.5))))
console.log('record start:', JSON.stringify(hub.recordStart().seq))
console.log('before the start:', JSON.stringify(await controls.submit(hubInputs.rewind(-1))))
console.log('seq is still', hub.seq === last)

hub.stop()
clock.stop()
