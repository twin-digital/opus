import type { PadEvent } from '../../midi/pad-event.js'
import { currentTimeMillis } from '../../engine/timer.js'
import type { InteractionEvent, InteractionEventType } from './input-event.js'
import { InputMap } from './input-map.js'

export class InputRouter {
  private inputMap: InputMap | null = null

  /**
   * Map containing the start time for when any pressed pads were first pressed.
   **/
  private padHolds: Map<string, { x: number; y: number; pressedAt: number }> = new Map<
    string,
    { x: number; y: number; pressedAt: number }
  >()

  /**
   * Sets the per-frame InputMap to use for routing events.
   */
  public setMap(map: InputMap): void {
    this.inputMap = map
  }

  /**
   * Handles a raw PadInputEvent from a device, transforming it into a semantic UI event and invoking the appropriate
   * handler from the current InputMap.
   */
  public handle(event: PadEvent): void {
    if (!this.inputMap) {
      return
    }

    //    logger.info({ event }, 'InputRouter: got input event')

    const key = `${event.x},${event.y}`
    if (event.type === 'pad-down') {
      this.padHolds.set(key, {
        x: event.x,
        y: event.y,
        pressedAt: currentTimeMillis(),
      })
    } else {
      this.padHolds.delete(key)
    }

    const { x, y } = event
    const type: InteractionEventType = event.type === 'pad-down' ? 'press' : 'release'

    const handler = this.inputMap.getHandler(x, y, type)
    if (!handler) {
      return
    }

    const interactionEvent = {
      type,
      absoluteX: x,
      absoluteY: y,
      x,
      y,
    } satisfies InteractionEvent

    handler(interactionEvent)
  }

  /**
   * Process any time-bound input events during the main loop.
   */
  public tick(_elapsedSeconds: number) {
    ;[...this.padHolds.values()].forEach(({ x, y, pressedAt }) => {
      if (!this.inputMap) {
        return
      }

      const handler = this.inputMap.getHandler(x, y, 'hold')
      if (!handler) {
        return
      }

      const interactionEvent = {
        absoluteX: x,
        absoluteY: y,
        pressedAt,
        type: 'hold',
        x,
        y,
      } satisfies InteractionEvent

      handler(interactionEvent)
    })
  }
}
