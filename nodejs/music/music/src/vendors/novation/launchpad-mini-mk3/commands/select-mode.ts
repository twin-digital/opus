import type { LaunchpadCommandWithReadback } from './common.js'

export type Mode = 'live' | 'programmer'

/**
 * @see - Programmer's Reference, page 7
 */
export const SelectModeCommand: LaunchpadCommandWithReadback<Mode> = {
  code: 0x0e,
  fromBytes: (data) => (data[0] === 1 ? 'programmer' : 'live'),
  name: 'select-mode',
  readback: true,
  toBytes: (mode) => [mode === 'programmer' ? 1 : 0],
}
