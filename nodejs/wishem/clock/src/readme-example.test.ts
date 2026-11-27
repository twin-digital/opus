import { expect, it } from 'vitest'
// The README example imports from '@thrashplay/wishem-clock'.
import { createHub } from '@thrashplay/wishem-hub'
import { TIME_ID, createTime, startClock, timeInputs, type TimePart } from './index.js'

it('runs the example of the README', async () => {
  const hub = createHub({ subsystems: [createTime()] })
  const clock = startClock(hub.attach({ id: 'clock', kind: 'input' }))
  const controls = hub.attach({ id: 'controls', kind: 'input' })
  hub.start()

  await controls.submit(timeInputs.setRunning(false)) // pause
  await controls.submit(timeInputs.advance(50)) // one step
  await controls.submit(timeInputs.setRunning(true)) // resume

  expect(hub.read()[TIME_ID]).toEqual({ now: 50, ticks: 1, running: true } satisfies TimePart)

  hub.stop() // The clock stops.
  clock.stop()
})
