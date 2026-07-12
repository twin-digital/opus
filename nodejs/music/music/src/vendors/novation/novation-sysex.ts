import type { ProprietarySysExMessage } from '../../midi/sysex-message-parser.js'

export interface BaseNovationMessage extends ProprietarySysExMessage {
  manufacturer: [0x00, 0x20, 0x29]
}

/**
 * Type predicate which determines if the specified message is a Novation SysEx message, based on the value of
 * its manufacturer ID.
 */
export function isNovationSysExMessage(message: ProprietarySysExMessage): message is BaseNovationMessage {
  return message.manufacturer.length === 3 && message.manufacturer[1] === 0x20 && message.manufacturer[2] === 0x29
}
