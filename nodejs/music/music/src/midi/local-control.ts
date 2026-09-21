import type { MidiDevice } from './midi-device.js'
import type { MidiChannel } from '../app/sound-picker/model.js'

/**
 * Sends Local Control (CC 122) to the piano on every MIDI channel, since which channel the piano listens for mode
 * messages on is its own configuration. Off, the keyboard stops sounding its own keys and only transmits, so every
 * key press can be re-voiced through the app; on restores the piano's factory behaviour.
 */
export const setLocalControl = (device: MidiDevice, on: boolean) => {
  for (let channel = 0; channel < 16; channel++) {
    device.send('cc', {
      channel: channel as MidiChannel,
      controller: 122,
      value: on ? 127 : 0,
    })
  }
}
