import type { Command } from '@oclif/core'
import Start from './cli/start.js'

export const Commands: Record<string, typeof Command> = {
  start: Start,
}
