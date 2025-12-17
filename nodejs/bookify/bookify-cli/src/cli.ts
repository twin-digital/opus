import type { Command } from '@oclif/core'
import Assemble from './cli/assemble.js'
import Pipeline from './cli/pipeline.js'
import Render from './cli/render.js'
import Transform from './cli/transform.js'

export const Commands: Record<string, typeof Command> = {
  assemble: Assemble,
  pipeline: Pipeline,
  render: Render,
  transform: Transform,
}
