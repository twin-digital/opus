import { logger } from '../../../logger.js'
import { type Canvas } from '../../../ui/canvas.js'
import type { RgbColor } from '../../../ui/color.js'
import type { Renderer } from '../../../ui/renderer.js'
import type { PadLighting } from './commands/set-led-lighting.js'
import type { LightingOptions } from './model.js'
import type { NovationLaunchpadMiniMk3 } from './novation-launchpad-mini-mk3.js'

export const LaunchpadPadWidth = 9
export const LaunchpadPadHeight = 9

/**
 * Creates a `PadLighting` value which turns off the LED of the pad at the given position.
 */
const turnPadOff = (x: number, y: number): PadLighting => ({
  x,
  y,
  lighting: {
    color: 0,
    type: 'static',
  },
})

/**
 * Renderer which displays an `RgbColor` `Canvas` by illuminating the LEDs on a Novation Launchpad Mini MK3.
 */
export class LaunchpadRenderer implements Renderer<RgbColor> {
  private lastCanvas: Canvas<RgbColor> | undefined

  public constructor(private launchpad: NovationLaunchpadMiniMk3) {
    // if our mode has changed, reset our 'lastCanvas' so that the whole display is redrawn
    launchpad.events.on('mode-changed', (event) => {
      if (event.mode === 'programmer') {
        logger.info('Detected mode change. Redrawing whole canvas.')
        this.reset()
      }
    })
  }

  public render(canvas: Canvas<RgbColor>) {
    const diff = this.lastCanvas === undefined ? canvas.getData() : canvas.getData().diff(this.lastCanvas.getData())

    // const items = diff.map(
    //   (x, y, value) => `(${x}, ${y})=>[${value?.join(',')}]`,
    // )
    // logger.info(
    //   {
    //     length: items.length,
    //     items,
    //   },
    //   'Canvas diff detail.',
    // )

    const padSettings = diff.map((x, y, color) => {
      return color === null ?
          turnPadOff(x, y)
        : {
            x,
            y,
            lighting: {
              type: 'static',
              color,
            } satisfies LightingOptions,
          }
    })

    if (padSettings.length > 0) {
      void this.launchpad.sendCommand('set-led-lighting', {
        pads: padSettings,
      })
    }

    this.lastCanvas = canvas
  }

  /**
   * Clear our last canvas, so the next frame performs a full draw.
   */
  public reset() {
    this.lastCanvas = undefined
  }
}
