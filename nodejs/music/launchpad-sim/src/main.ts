import { WebRenderer } from './web-renderer'
import type { MidiDevice } from '@thrashplay/music/midi/midi-device'
import type { NovationLaunchpadMiniMk3 } from '@thrashplay/music/vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3'
import { createLauncherProgram } from '@thrashplay/music/app/launcher-program'
import { WebMidiPiano } from './web-midi-piano'
import { MidiScheduler } from '@thrashplay/music/midi/sequencing'
import { InputRouter } from '@thrashplay/music/ui/input/input-router'
import { Engine } from '@thrashplay/music/engine/engine'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const launchpadContainer = document.getElementById('launchpad')!
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const pianoContainer = document.getElementById('piano')!
const piano = new WebMidiPiano(pianoContainer)
const renderer = new WebRenderer(launchpadContainer)
const padEvents = renderer.padEvents

const noop = (..._args: unknown[]) => {
  // noop
}

const createStubLaunchpad = () =>
  ({
    events: {
      off: noop,
      on: noop,
    },
    sendCommand: noop,
  }) as unknown as NovationLaunchpadMiniMk3

const launchpad = createStubLaunchpad()
const inputRouter = new InputRouter()
padEvents.on('pad-down', inputRouter.handle.bind(inputRouter))
padEvents.on('pad-up', inputRouter.handle.bind(inputRouter))

const engine = new Engine({
  input: inputRouter,
  initialProgram: await createLauncherProgram({
    launchpad,
    renderer,
    scheduler: new MidiScheduler(piano as unknown as MidiDevice),
    synthesizer: piano as unknown as MidiDevice,
  }),
  renderer,
})

await engine.start()
