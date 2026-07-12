import type { LaunchpadCommandWithReadback } from './common.js'

export type Layout = 'session' | 'custom-0' | 'custom-1' | 'custom-2' | 'custom-3' | 'daw-faders' | 'programmer-mode'

/**
 * @see - Programmer's Reference, page 7
 */
export const SelectLayoutCommand: LaunchpadCommandWithReadback<Layout> = {
  code: 0x0d,
  fromBytes: (data) => {
    switch (data[0]) {
      case 0x00:
        return 'custom-0'
      case 0x04:
        return 'custom-1'
      case 0x05:
        return 'custom-2'
      case 0x06:
        return 'custom-3'
      case 0x0d:
        return 'daw-faders'
      case 0x7f:
        return 'programmer-mode'
      default:
        return 'custom-0'
    }
  },
  name: 'select-layout',
  readback: true,
  toBytes: (mode) => {
    switch (mode) {
      case 'custom-0':
        return [0x00]
      case 'custom-1':
        return [0x04]
      case 'custom-2':
        return [0x05]
      case 'custom-3':
        return [0x06]
      case 'daw-faders':
        return [0x0d]
      case 'programmer-mode':
        return [0x7f]
      default:
        return []
    }
  },
}
