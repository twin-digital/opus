import type { Command } from '@oclif/core'
import Start from './commands/start.js'

export const Commands: Record<string, typeof Command> = {
  start: Start,
}
