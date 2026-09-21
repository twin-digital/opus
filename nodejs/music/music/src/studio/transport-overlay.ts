import type { Program } from '../engine/program.js'
import type { RgbColor } from '../ui/color.js'
import { createButton } from '../ui/components/button.js'
import { group } from '../ui/components/group.js'
import { translate } from '../ui/transform/translate.js'
import type { StudioApi } from './studio-service.js'

/**
 * Pads in the top CC row, beside the Novation logo. Every program leaves these two unused, so the
 * transport stays put whichever program is running.
 */
export const TransportPads = {
  record: { x: 7, y: 8 },
  play: { x: 6, y: 8 },
} as const

const RecordIdle: RgbColor = [40, 0, 0]
const RecordActive: RgbColor = [127, 0, 0]
const PlayIdle: RgbColor = [36, 36, 36]
const PlayActive: RgbColor = [0, 127, 0]
const Off: RgbColor = [0, 0, 0]

/** Seconds per pulse while recording or playing. */
const PulsePeriodSeconds = 1
const PulseFloor = 0.25

const scale = (color: RgbColor, factor: number): RgbColor => [color[0] * factor, color[1] * factor, color[2] * factor]

const pulse = (color: RgbColor, time: number): RgbColor => {
  const phase = 0.5 + 0.5 * Math.sin((2 * Math.PI * time) / PulsePeriodSeconds)
  return scale(color, PulseFloor + (1 - PulseFloor) * phase)
}

/**
 * Two-pad recording transport for the Launchpad: record and play-my-last-one. Each pad toggles, so
 * a second press stops. The record pad idles dim red and pulses red while recording; the play pad
 * idles dim white once there is something to play and pulses green during playback. Both go dark
 * when REAPER is unreachable.
 *
 * Meant to be composed into the launcher as an overlay, above whatever program is running.
 */
export const createTransportOverlay = (service: StudioApi): Program => {
  let clock = 0

  const recordPad = () => {
    const { connected, transport } = service.getState()
    return translate(
      TransportPads.record.x,
      TransportPads.record.y,
      createButton({
        color:
          !connected ? Off
          : transport === 'recording' ? pulse(RecordActive, clock)
          : RecordIdle,
        onPress: () => {
          void service.toggleRecord()
        },
      }),
    )
  }

  const playPad = () => {
    const { connected, transport, takes } = service.getState()
    return translate(
      TransportPads.play.x,
      TransportPads.play.y,
      createButton({
        color:
          !connected || takes.length === 0 ? Off
          : transport === 'playing' ? pulse(PlayActive, clock)
          : PlayIdle,
        onPress: () => {
          void service.togglePlayLatest()
        },
      }),
    )
  }

  return {
    getDrawable: () => group(recordPad(), playPad()),
    update: (elapsedSeconds) => {
      clock += elapsedSeconds
    },
  }
}
