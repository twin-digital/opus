export * from './common.js'
export * from './select-layout.js'
export * from './select-mode.js'
export * from './setup-daw-faders.js'

import { find } from 'lodash-es'
import { type LaunchpadCommandConfig } from './common.js'
import { SelectLayoutCommand } from './select-layout.js'
import { SelectModeCommand } from './select-mode.js'
import { SetLedLightingCommand } from './set-led-lighting.js'

export const LaunchpadCommands = {
  'select-layout': SelectLayoutCommand,
  'select-mode': SelectModeCommand,
  'set-led-lighting': SetLedLightingCommand,
} satisfies Record<string, LaunchpadCommandConfig>

export const lookupCommand = (code: number): (typeof LaunchpadCommands)[keyof typeof LaunchpadCommands] | undefined => {
  return find(LaunchpadCommands, (v) => v.code === code)
}

export type LaunchpadCommand = keyof typeof LaunchpadCommands
export type LaunchpadCommandDataType<T extends LaunchpadCommand> =
  (typeof LaunchpadCommands)[T] extends LaunchpadCommandConfig<infer U> ? U : never
