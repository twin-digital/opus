# @thrashplay/wishem-clock

The time subsystem and the clock of a Wishem construct. The package uses no Node.js API and no browser API. The command `pnpm build --filter @thrashplay/wishem-clock` fails when a source file uses a Node.js module or global.

A construct that needs no time includes none of these parts.

## The two subsystems

- **Time subsystem.** `createTime()` makes a model subsystem with the ID `time`. Its part holds `now` (the time of the construct in milliseconds), `ticks` (the count of ticks), and `running`.
- **Clock.** `startClock(port)` starts a timer on the port of an input subsystem. The clock holds no state of the construct. It sends ticks to the hub.

A construct can include the time subsystem with no clock. A test, an agent, or a replay then advances the construct with the ticks that it sends.

## The tick

A tick is the input `time/advance` with a length in milliseconds. The time subsystem adds the length to `now` and adds 1 to `ticks`. It refuses a length that is not a finite number larger than 0.

The clock sends ticks of a fixed length, the step length. The default is 50 milliseconds. Set a different length with the option `stepMs`.

At each call of its timer, the clock sends one tick for each full step length of real time since the last tick. It sends at most `maxTicksPerCall` ticks (an integer, default 5) in one call. It drops the time above that limit.

## Pause and step

The input `time/set-running` sets `running`. While `running` is `false`, the clock sends no tick. The time of a pause causes no tick after the pause ends.

A tick applies for each value of `running`. To step a paused construct, send one `time/advance`.

## Rewind

After the hub applies the input `hub/rewind`, the clock measures real time again from that moment. The real time before the rewind causes no tick after it. While `running` is `true`, the next tick comes one step length after the rewind. When the rewind returns to a state with `running` set to `false`, the clock sends no tick until `running` becomes `true`.

## Start and stop

`startClock` throws an `Error` in these cases:

- The port is not the port of an input subsystem.
- The joined state has no part `time`.
- The option `stepMs` is not a finite number larger than 0.
- The option `maxTicksPerCall` is not an integer larger than 0.

The clock stops when you call `stop()` and when the hub sends the `stopping` event. A second `stop()` does nothing.

The options `timer` and `now` replace `setInterval` and `Date.now`. A test gives a timer that it calls itself and a source of real time that it sets.

## Example

```ts
import { createHub } from '@thrashplay/wishem-hub'
import { createTime, startClock, timeInputs } from '@thrashplay/wishem-clock'

const hub = createHub({ subsystems: [createTime()] })
const clock = startClock(hub.attach({ id: 'clock', kind: 'input' }))
const controls = hub.attach({ id: 'controls', kind: 'input' })
hub.start()

await controls.submit(timeInputs.setRunning(false)) // pause
await controls.submit(timeInputs.advance(50)) // one step
await controls.submit(timeInputs.setRunning(true)) // resume

hub.stop() // The clock stops.
```
