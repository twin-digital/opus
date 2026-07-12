import { NovationLaunchpadMiniMk3 } from './vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'
import { LaunchpadRenderer } from './vendors/novation/launchpad-mini-mk3/launchpad-renderer.js'
import { logger } from './logger.js'
import { MidiDevice } from './midi/midi-device.js'
import { createLauncherProgram } from './app/launcher-program.js'
import { MidiScheduler } from './midi/sequencing.js'
import { makeLaunchpadInputRouter } from './vendors/novation/launchpad-mini-mk3/launchpad-input.js'
import { Engine } from './engine/engine.js'

const main = async (): Promise<void> => {
  const launchpad = new NovationLaunchpadMiniMk3()
  const renderer = new LaunchpadRenderer(launchpad)

  launchpad.events.on('midi-stats', ({ bytesReceived, bytesSent, interval }) => {
    const rx = Math.round(bytesSent / (interval / 1000))
    const tx = Math.round(bytesReceived / (interval / 1000))
    const total = rx + tx

    logger.info(`[STATS] MIDI data transmitted. [total=${total} bps, tx=${tx} bps, rx=${rx} bps]`)
  })

  // const fp30x = new MidiDevice('FP-30X MIDI Bluetooth')
  const fp30x = new MidiDevice({
    name: 'Roland Digital Piano',
  })

  const launcher = await createLauncherProgram({
    launchpad,
    options: {
      speakInstrumentNames: true,
    },
    renderer,
    scheduler: new MidiScheduler(fp30x),
    synthesizer: fp30x,
  })

  const engine = new Engine({
    input: makeLaunchpadInputRouter(launchpad),
    initialProgram: launcher,
    renderer,
  })

  await engine.start()
}

await main()
