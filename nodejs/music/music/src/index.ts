#!/usr/bin/env node
import { NovationLaunchpadMiniMk3 } from './vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'
import { LaunchpadRenderer } from './vendors/novation/launchpad-mini-mk3/launchpad-renderer.js'
import { logger } from './logger.js'
import { MidiDevice } from './midi/midi-device.js'
import { createLauncherProgram } from './app/launcher-program.js'
import { MidiScheduler } from './midi/sequencing.js'
import { makeLaunchpadInputRouter } from './vendors/novation/launchpad-mini-mk3/launchpad-input.js'
import { Engine } from './engine/engine.js'
import { getConfig } from './config.js'
import { ReaperClient } from './studio/reaper-client.js'
import { StudioService } from './studio/studio-service.js'
import { createStudioServer } from './studio/studio-server.js'
import { setLocalControl } from './midi/local-control.js'

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

  const { midiMirror, reaperUrl, studioPort } = getConfig()

  // Whatever the piano hears, the mirror port hears too, so a DAW can record the re-voiced MIDI.
  if (midiMirror !== undefined) {
    fp30x.mirrorTo(new MidiDevice({ name: midiMirror, direction: 'output' }))
  }

  // The programs turn the piano's Local Control off; hand it back on the way out, so an interrupted
  // session leaves a piano that still plays on its own.
  const restorePiano = () => {
    setLocalControl(fp30x, true)
  }
  process.on('exit', restorePiano)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      restorePiano()
      process.exit(0)
    })
  }

  const studio =
    reaperUrl === undefined ? undefined : new StudioService({ client: new ReaperClient({ baseUrl: reaperUrl }) })
  studio?.start()
  if (studio !== undefined) {
    await createStudioServer({ service: studio, port: studioPort })
  }

  const launcher = await createLauncherProgram({
    launchpad,
    options: {
      speech: true,
    },
    renderer,
    scheduler: new MidiScheduler(fp30x),
    studio,
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
