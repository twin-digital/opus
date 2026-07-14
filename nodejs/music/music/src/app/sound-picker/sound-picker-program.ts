import { group } from '../../ui/components/group.js'
import { createChannelLevelScreen } from './channel-level-screen/channel-level-screen.js'
import type { MidiDevice } from '../../midi/midi-device.js'
import { LaunchpadController } from './controller.js'
import { createSideColumn, type Side } from './global-nav/side-column.js'
import { createTopScreenSelector } from './global-nav/top-screen-selector.js'
import { createSoundSelectScreen } from './sound-select-screen/sound-select-screen.js'
import type { Cell, Drawable } from '../../ui/drawable.js'
import type { RgbColor } from '../../ui/color.js'
import type { NovationLaunchpadMiniMk3 } from '../../vendors/novation/launchpad-mini-mk3/novation-launchpad-mini-mk3.js'
import { logger } from '../../logger.js'
import { speak } from '../speak.js'
import type { ReadbackEvent } from '../../vendors/novation/launchpad-mini-mk3/events.js'
import {
  drumKitInstruments,
  InstrumentFamilies,
  type Instrument,
  type InstrumentFamily,
} from '../../midi/instrument-data.js'
import { InstrumentsByFamily } from '../../midi/instruments.js'
import type { Program } from '../../engine/program.js'
import { SamplePlayer } from '../../audio/sample-player.js'
import { SoundBoardSampleNames } from '../../soundboard/sound-boards.js'
import { InstrumentFamilyColors } from './sound-select-screen/colors.js'
import { toChannelId, type ChannelId, type MidiChannel } from './model.js'

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

/**
 * First note of the right-hand zone when the keyboard is split: C4. Everything below it belongs to the left hand,
 * which keeps the entire GM standard drum map (35–59) in reach.
 */
const SplitPoint = 60

/**
 * The left hand's sound whenever the split turns on: the GM standard drum kit. The default is fixed — there is no
 * memory of prior left-hand choices.
 */
const GmStandardKit = drumKitInstruments[0]

/**
 * Channel each hand plays. Bottom-up like the piano: the left hand is the low zone, so it is channel 0.
 */
const LeftHand = toChannelId(0)
const RightHand = toChannelId(1)

const familyOf = (instrument: Instrument): InstrumentFamily =>
  InstrumentFamilies.find((family) => family.name === instrument.family) ?? InstrumentFamilies[0]

export const createSoundPickerProgram = (
  launchpad: NovationLaunchpadMiniMk3,
  synthesizer: MidiDevice,
  {
    speakInstrumentNames = true,
  }: {
    /**
     * Whether to speak selection feedback aloud: instrument names, side selection, and split announcements.
     * @defaultValue true
     */
    speakInstrumentNames?: boolean
  } = {},
): Program => {
  const samples = new SamplePlayer()
  const controller = new LaunchpadController(synthesizer, samples, 2)
  // Partial because the records are empty until initialize() seeds them, and a frame can be drawn before that.
  const selectedFamilies: Partial<Record<number, InstrumentFamily>> = {}
  const selectedInstruments: Partial<Record<number, Instrument>> = {}
  let selectedChannelId: ChannelId = RightHand
  let selectedScreenId = 1
  let split = false

  /**
   * Seconds since the program started; drives the side column's animations.
   */
  let clock = 0

  /**
   * Worn until a channel has a selection with a color — before initialize() seeds the selections, or if an
   * instrument's family has no color entry, the side column renders neutral rather than throwing.
   */
  const NeutralColor: RgbColor = [127, 127, 127]

  // A partial view of the color table: instrument families are open-ended strings, so a lookup can genuinely miss.
  const familyColors: Partial<Record<string, RgbColor>> = InstrumentFamilyColors

  const displayColor = (channelId: ChannelId): RgbColor =>
    familyColors[selectedInstruments[channelId]?.family ?? ''] ?? NeutralColor

  /**
   * Rebuilds the keyboard routing to match the split state: two zones when split, or the whole keyboard on the
   * selected side's channel when not.
   */
  const applyRoutes = () => {
    controller.setRoutes(
      split ?
        [
          { channelId: LeftHand, range: { low: 0, high: SplitPoint - 1 } },
          { channelId: RightHand, range: { low: SplitPoint, high: 127 } },
        ]
      : [{ channelId: selectedChannelId }],
    )
  }

  /**
   * Records and applies a channel's instrument without announcing it. User-driven selections go through
   * `selectInstrument`, which also speaks the name.
   */
  const setChannelInstrument = (channelId: ChannelId, instrument: Instrument) => {
    selectedFamilies[channelId] = familyOf(instrument)
    selectedInstruments[channelId] = instrument
    controller.selectSound(channelId, instrument)
  }

  const selectFamily = (family: InstrumentFamily) => {
    selectedFamilies[selectedChannelId] = family
  }

  const selectInstrument = (instrument: Instrument) => {
    if (speakInstrumentNames) {
      void speak(instrument.name)
    }

    setChannelInstrument(selectedChannelId, instrument)
    rebuildChannelLevelScreen()
  }

  const selectSide = (side: Side) => {
    const channelId = side === 'left' ? LeftHand : RightHand
    if (selectedChannelId === channelId) {
      return
    }

    selectedChannelId = channelId
    if (speakInstrumentNames) {
      void speak(side === 'left' ? 'left hand' : 'right hand')
    }
  }

  const toggleSplit = () => {
    split = !split

    // Stop sounding notes so nothing hangs across the transition — a key held through the toggle would otherwise
    // never see its note-off on the channel it started on.
    controller.stopAllSound()

    if (split) {
      // The right hand keeps the current sound; the left hand becomes the standard drum kit. "No memory of prior
      // left-hand choices" extends to the mixer: a mute or level left over from an earlier split would silently kill
      // a zone whose pad presents it as fresh and live.
      const current = selectedInstruments[selectedChannelId]
      if (current !== undefined) {
        setChannelInstrument(RightHand, current)
      }
      setChannelInstrument(LeftHand, GmStandardKit)
      controller.setMuted(LeftHand, false)
      controller.setLevel(LeftHand, 127)
      selectedChannelId = RightHand
    }
    // Turning split off collapses the keyboard to the selected side's sound, which the routes alone express.

    applyRoutes()
    rebuildChannelLevelScreen()

    if (speakInstrumentNames) {
      void speak(split ? 'two instruments' : 'one instrument')
    }
  }

  /**
   * Channels the levels screen shows: both sides when split, otherwise only the side carrying the sound. Rows wear
   * the family color of the channel's selected instrument, matching its side pad.
   */
  const activeChannelStates = () =>
    controller.channels
      .filter((channel) => split || channel.id === selectedChannelId)
      .map((channel) => ({
        color: displayColor(channel.id),
        id: channel.id,
        level: channel.level,
        muted: channel.muted,
      }))

  // Level and mute changes adjust the mixer only — they never change which side the picker edits. Side selection
  // always goes through selectSide, so it is announced and the collapse target never moves silently.
  // The levels screen lives across frames because its faders hold in-flight gesture state; it is rebuilt only when
  // the channels it shows (or their colors) change.
  let channelLevelScreenFactory: () => Drawable = () => ({ draw: () => [] })
  const rebuildChannelLevelScreen = () => {
    channelLevelScreenFactory = createChannelLevelScreen({
      channels: activeChannelStates(),
      onLevelChanged: (channelId, level) => {
        controller.setLevel(channelId, level)
      },
      onMuteStatusChanged: (channelId, muted) => {
        controller.setMuted(channelId, muted)
      },
    })
  }

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
        createSideColumn({
          leftColor: displayColor(LeftHand),
          rightColor: displayColor(RightHand),
          onSideSelected: selectSide,
          onSplitToggled: toggleSplit,
          selectedSide: selectedChannelId === LeftHand ? 'left' : 'right',
          split,
          time: clock,
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

      controller.channels.forEach((channel) => {
        setChannelInstrument(channel.id, InstrumentsByFamily[InstrumentFamilies[0].name][0])

        // Normalize the mixer alongside the instruments, so re-initializing yields the same state as a first launch —
        // a stale mute would otherwise silently kill a zone in a fresh-looking session.
        controller.setMuted(channel.id, false)
        controller.setLevel(channel.id, 127)
      })

      split = false
      selectedChannelId = RightHand
      selectedScreenId = 1
      clock = 0

      applyRoutes()
      rebuildChannelLevelScreen()

      controller.initialize()

      // off-then-on keeps the handler registered exactly once, however many times the program is re-initialized.
      launchpad.events.off('readback', handleReadback)
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
    update: (elapsedSeconds) => {
      clock += elapsedSeconds
    },
  }
}
