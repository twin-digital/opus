import type { RgbColor } from '../ui/color.js'
import type { InputRouter } from '../ui/input/input-router.js'
import type { Renderer } from '../ui/renderer.js'
import { InputMap } from '../ui/input/input-map.js'
import { createCanvas, type Canvas } from '../ui/canvas.js'
import { startLoop } from './main-loop.js'
import type { Program } from './program.js'

const normalize = (color: RgbColor): RgbColor => {
  color[0] = Math.round(color[0])
  color[1] = Math.round(color[1])
  color[2] = Math.round(color[2])
  return color
}

export class Engine {
  private input?: InputRouter
  private program: Program
  private renderer: Renderer<RgbColor>
  private state: 'started' | 'stopped' = 'stopped'
  private targetFps: number

  public constructor({
    input,
    initialProgram,
    renderer,
    targetFps = 20,
  }: {
    /**
     * Input router used to map physical interactions to the appropriate UI handlers.
     */
    input?: InputRouter

    /**
     * The initial `Program` to execute.
     */
    initialProgram: Program

    /**
     * Renderer which will draw our components.
     */
    renderer: Renderer<RgbColor>

    /**
     * Target FPS at which to run the main loop.
     */
    targetFps?: number
  }) {
    this.input = input
    this.program = initialProgram
    this.renderer = renderer
    this.targetFps = targetFps
  }

  private draw(): { canvas: Canvas<RgbColor>; inputMap: InputMap } {
    const scene = this.program.getDrawable()
    const cells = scene.draw()

    const canvas = createCanvas<RgbColor>(9, 9)
    cells.forEach((cell) => {
      canvas.set(cell.x, cell.y, normalize(cell.value))
    })

    const inputMap = InputMap.fromCells(cells)

    return { canvas, inputMap }
  }

  private handleInput(elapsedSeconds: number) {
    this.input?.tick(elapsedSeconds)
  }

  private render() {
    const { canvas, inputMap } = this.draw()
    this.input?.setMap(inputMap)
    this.renderer.render(canvas)
  }

  private update(elapsedSeconds: number) {
    this.program.update?.(elapsedSeconds)
  }

  public async start(): Promise<void> {
    if (this.state === 'stopped') {
      this.state = 'started'

      await this.program.initialize?.()

      await startLoop({
        done: () => this.state === 'stopped',
        handleInput: this.handleInput.bind(this),
        render: this.render.bind(this),
        targetFps: this.targetFps,
        update: this.update.bind(this),
      })
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'started') {
      await this.program.shutdown?.()
      this.state = 'stopped'
    }
  }
}
