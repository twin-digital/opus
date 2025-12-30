import type { Command } from '@oclif/core'
import Generate from './commands/generate.js'

export const Commands: Record<string, typeof Command> = {
  generate: Generate,
}
