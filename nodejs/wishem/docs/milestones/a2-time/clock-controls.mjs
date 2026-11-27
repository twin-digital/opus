// A hub with the time subsystem and a clock. Runs, pauses, steps by one tick, and runs again.
// Usage: node clock-controls.mjs
// These files are the packages '@thrashplay/wishem-hub' and '@thrashplay/wishem-clock', after their build.
import { createHub } from '../../../hub/dist/index.js'
import { createTime, startClock, timeInputs } from '../../../clock/dist/index.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const hub = createHub({ subsystems: [createTime()] })
const controls = hub.attach({ id: 'controls', kind: 'input' })
const clock = startClock(hub.attach({ id: 'clock', kind: 'input' }), { stepMs: 100 })
const show = (label) => console.log(`${label}:`, JSON.stringify(controls.read().time), `seq ${hub.seq}`)

hub.start()
show('start')
await sleep(1050)
show('after 1 s of running')

await controls.submit(timeInputs.setRunning(false))
show('paused')
await sleep(1000)
show('after 1 s of pause')

console.log('step:', JSON.stringify(await controls.submit(timeInputs.advance(100))))
show('after one step')
await sleep(500)
show('after 0.5 s more of pause')

await controls.submit(timeInputs.setRunning(true))
show('running again')
await sleep(550)
show('after 0.5 s of running')

hub.stop()
clock.stop()
