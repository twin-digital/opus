import { group } from '../../ui/components/group.js'
import { createChannelLevelScreen } from './channel-level-screen/channel-level-screen.js'
import type { MidiDevice } from '../../midi/midi-device.js'
import { LaunchpadController } from './controller.js'
import { createSideTrackSelector } from './global-nav/side-track-selector.js'
import { createTopScreenSelector } from './global-nav/top-screen-selector.js'
import { createSoundSelectScreen } from './sound-select-screen/sound-select-screen.js'
import type { Cell, Drawable } from '../../ui/drawable.js'
import type { RgbColor } from '../../ui/color.js'
import type { NovationLaunchpadMiniMk3 } from '../../vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'
import { logger } from '../../logger.js'
import { speak } from '../speak.js'
import type { ReadbackEvent } from '../../vendors/novation/launchpad-mini-mk3/events.js'
import { InstrumentFamilies, type Instrument, type InstrumentFamily } from '../../midi/instrument-data.js'
import { InstrumentsByFamily } from '../../midi/instruments.js'
import type { Program } from '../../engine/program.js'
import { SamplePlayer } from '../../audio/sample-player.js'
import { SoundBoardSampleNames } from '../../soundboard/sound-boards.js'
import type { MidiChannel } from './model.js'

/**
 * Sends Local Control (CC 122) to the piano on every MIDI channel, since which channel the piano listens for mode
 * messages on is its own configuration. Off, the keyboard stops sounding its own keys and only transmits — which is
 * the mode this program is built around: every key press is re-voiced through the app, as an echoed program or a
 * sample, and the piano sounding its factory tone underneath doubles every note.
 */
const setLocalControl = (device: MidiDevice, on: boolean) => {
  for (let channel = 0; channel < 16; channel++) {
    device.send('cc', {
      channel: channel as MidiChannel,
      controller: 122,
      value: on ? 127 : 0,
    })
  }
}

const log = logger.child({}, { msgPrefix: '[PROGRAM] ' })

export const createSoundPickerProgram = (
  launchpad: NovationLaunchpadMiniMk3,
  synthesizer: MidiDevice,
  {
    speakInstrumentNames = true,
  }: {
    /**
     * Whether to speak instrument names as they are selected or not.
     * @defaultValue true
     */
    speakInstrumentNames?: boolean
  } = {},
): Program => {
  const channelCount = 1
  const samples = new SamplePlayer()
  const controller = new LaunchpadController(synthesizer, samples, channelCount)
  const selectedFamilies: Record<number, InstrumentFamily> = {}
  const selectedInstruments: Record<number, Instrument> = {}
  let selectedChannelId = controller.channels[0].id
  let selectedScreenId = 1

  // play notes when level changed?
  //
  // synthesizer.send('noteon', {
  //   note: 30,
  //   velocity: 64,
  //   channel: index as Channel,
  // })
  //
  // setTimeout(() => {
  //   synthesizer.send('noteoff', {
  //     note: 30,
  //     velocity: 0,
  //     channel: index as Channel,
  //   })
  // }, 250)

  const selectFamily = (family: InstrumentFamily) => {
    selectedFamilies[selectedChannelId] = family
  }

  const selectInstrument = (instrument: Instrument) => {
    if (speakInstrumentNames) {
      void speak(instrument.name)
    }

    selectedInstruments[selectedChannelId] = instrument
    controller.selectSound(selectedChannelId, instrument)
  }

  const channelLevelScreenFactory = createChannelLevelScreen({
    channels: [...controller.channels],
    onLevelChanged: (channelId, level) => {
      controller.setLevel(channelId, level)
      selectedChannelId = channelId
    },
    onMuteStatusChanged: (channelId, muted) => {
      controller.setMuted(channelId, muted)
      selectedChannelId = channelId
    },
    selectedChannelId,
  })

  const makeSoundSelectScreen = () =>
    createSoundSelectScreen({
      onFamilySelected: selectFamily,
      onInstrumentSelected: selectInstrument,
      selectedFamily: selectedFamilies[selectedChannelId],
      selectedInstrument: selectedInstruments[selectedChannelId],
    })()

  const makeSelectedScreen = () => {
    switch (selectedScreenId) {
      case 0:
        return channelLevelScreenFactory
      case 1:
        return makeSoundSelectScreen
      default:
        return () =>
          ({
            draw: () => [] as Cell<RgbColor>[],
          }) satisfies Drawable
    }
  }

  const handleReadback = ({ command, data }: ReadbackEvent) => {
    if (command === 'select-mode' && data[0] !== 1) {
      log.info('Setting programmer mode.')
      void launchpad.sendCommand('select-mode', 'programmer')
    }
  }

  return {
    getDrawable: () => {
      return group(
        makeSelectedScreen()(),
        createSideTrackSelector({
          channels: controller.channels,
          onChannelSelected: (channelId) => {
            selectedChannelId = channelId
          },
          selectedChannelId,
        }),
        createTopScreenSelector({
          numberOfScreens: 2,
          onScreenSelected: (id) => {
            selectedScreenId = id
          },
          selectedScreenId,
        }),
      )
    },
    initialize: () => {
      log.info('Initializing "Sound Picker" program.')

      setLocalControl(synthesizer, false)

      // Decode every sound-board sample up front. The samples are small and already on disk, so this finishes long
      // before anyone can select a board, and playback never waits on I/O.
      void samples.load(SoundBoardSampleNames)

      // reset instruments and mute all tracks except first
      controller.channels.forEach((channel, index) => {
        selectedFamilies[channel.id] = InstrumentFamilies[0]
        selectedInstruments[channel.id] = InstrumentsByFamily[selectedFamilies[channel.id].name][0]
        controller.selectSound(channel.id, selectedInstruments[channel.id])

        if (index > 0) {
          controller.setMuted(channel.id, true)
        }
      })

      selectedChannelId = controller.channels[0].id
      selectedScreenId = 1

      controller.initialize()
      launchpad.events.on('readback', handleReadback)
    },
    shutdown: () => {
      log.info('Shutting down "Sound Picker" program.')
      controller.shutdown()
      setLocalControl(synthesizer, true)
      launchpad.events.off('readback', handleReadback)

      // Releases the audio output device. Without it the render thread's handles keep Node's event loop alive and the
      // process never exits.
      void samples.close()
    },
  }
}
