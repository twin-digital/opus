// A hub with the time subsystem and a clock. Prints the part `time` after each input.
// Usage: node clock-demo.mjs
// These files are the packages '@thrashplay/wishem-hub' and '@thrashplay/wishem-clock', after their build.
import { createHub } from '../../../hub/dist/index.js'
import { createTime, startClock, timeInputs } from '../../../clock/dist/index.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const hub = createHub({ subsystems: [createTime()] })
const screen = hub.attach({ id: 'screen', kind: 'output' })
const controls = hub.attach({ id: 'controls', kind: 'input' })
const clock = startClock(hub.attach({ id: 'clock', kind: 'input' }), { stepMs: 100 })

screen.subscribe((event) => {
  if (event.type === 'applied') {
    console.log(
      `#${event.input.seq} ${event.input.type} from ${event.input.source}`,
      JSON.stringify(screen.read().time),
    )
  }
})

hub.start()
console.log('running for 350 ms')
await sleep(350)

console.log('pause')
await controls.submit(timeInputs.setRunning(false))
await sleep(300)
console.log('step once while paused')
await controls.submit(timeInputs.advance(100))
console.log('resume')
await controls.submit(timeInputs.setRunning(true))
await sleep(250)

console.log('refused input:', JSON.stringify(await controls.submit(timeInputs.advance(-5))))
hub.stop()
clock.stop()
console.log('stopped')
