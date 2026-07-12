import type { LightingOptions } from '../model.js'
import type { LaunchpadCommandWithoutReadback } from './common.js'

const padLightingToBytes = (x: number, y: number, data: LightingOptions): number[] => {
  const TYPE_PALETTE = 0x00
  const TYPE_FLASHING = 0x01
  const TYPE_PULSING = 0x02
  const TYPE_RGB = 0x03

  const ledIndex = 11 + 10 * y + x

  switch (data.type) {
    case 'flashing':
      return [TYPE_FLASHING, ledIndex, ...data.colors]
    case 'pulsing':
      return [TYPE_PULSING, ledIndex, data.color]
    case 'static':
      if (Array.isArray(data.color)) {
        return [TYPE_RGB, ledIndex, ...data.color]
      } else {
        return [TYPE_PALETTE, ledIndex, data.color]
      }
  }
}

export interface PadLighting {
  /**
   * X-coordinate of the pad, with '0' being the leftmost column and '8' being the rightmost.
   */
  x: number

  /**
   * Y-coordinate of the pad, with '0' being the bottom row and '8' being the top.
   */
  y: number

  /**
   * Lighting configuration to apply to this pad.
   */
  lighting: LightingOptions
}

export const SetLedLightingCommand: LaunchpadCommandWithoutReadback<{
  pads: PadLighting[]
}> = {
  code: 0x03,
  name: 'set-led-lighting',
  toBytes: ({ pads }) => pads.flatMap((pad) => padLightingToBytes(pad.x, pad.y, pad.lighting)),
  readback: false,
}
