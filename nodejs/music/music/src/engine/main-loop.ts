import { isBrowser } from '../app/is-browser.js'
import { currentTimeMillis } from './timer.js'

/**
 * Starts a "game loop" which performs "update" and "render" operations at a measured pace. Uses an appropriate
 * scheduling mechanism for both browser and Node.js environments. Returns a promise which will resolve when the loop
 * exits (i.e. when "done" returns true).
 */
export const startLoop = ({
  done,
  handleInput,
  render,
  targetFps = 60,
  update,
}: {
  /**
   * When this function returns true, the loop will exit and the promise will resolve.
   */
  done: () => boolean

  /**
   * Process any user input which has been received.
   * @param elapsedSeconds Amount of time passed sicne the last call.
   */
  handleInput?: (elapsedSeconds: number) => void

  /**
   * Render function which is called approximately `targetFps` times per second to render the application's interface.
   */
  render?: () => void

  /**
   * Desired frames per second, which is the number of times the 'update' and 'render' functions will be called each
   * second. In a browser environment, this value is ignored.
   */
  targetFps?: number

  /**
   * Update function which should update the application state. Will be passed the amount of time which has elapsed, in
   * seconds, since the last call to `update`.
   */
  update?: (elapsedSeconds: number) => void
}): Promise<void> => {
  let lastFrameAt = currentTimeMillis()
  const frameInterval = 1000 / targetFps

  return new Promise<void>((resolve) => {
    const tick = (timestamp?: number): void => {
      const current = timestamp ?? currentTimeMillis()
      const elapsedSeconds = (current - lastFrameAt) / 1000
      lastFrameAt = current

      handleInput?.(elapsedSeconds)
      update?.(elapsedSeconds)
      render?.()

      if (done()) {
        resolve()
      } else {
        if (isBrowser()) {
          window.requestAnimationFrame(tick)
        } else {
          // in Node: self-throttled setTimeout to hit ~targetFPS
          const elapsed = currentTimeMillis() - current
          const delay = Math.max(0, frameInterval - elapsed)
          setTimeout(() => {
            tick(currentTimeMillis())
          }, delay)
        }
      }
    }

    if (isBrowser()) {
      window.requestAnimationFrame(tick)
    } else {
      tick(currentTimeMillis())
    }
  })
}
