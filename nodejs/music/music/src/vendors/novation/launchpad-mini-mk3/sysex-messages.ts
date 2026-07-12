import type { UnknownMessage } from '../../../midi/sysex-message-parser.js'
import { isNovationSysExMessage, type BaseNovationMessage } from '../novation-sysex.js'

export interface ReadbackMessage extends BaseNovationMessage {
  /**
   * Numeric ID of the command sending the readback.
   */
  command: number

  /**
   * Readback data.
   */
  payload: number[]

  type: 'readback'
}

export type LaunchpadSysExMessage = ReadbackMessage

export const parseSysexMessage = (message: UnknownMessage): LaunchpadSysExMessage | UnknownMessage => {
  const isReadback = message.data[0] === 0x02 && message.data[1] === 0x0d

  if (isNovationSysExMessage(message) && isReadback) {
    return {
      ...message,
      command: message.data[2],
      payload: message.data.slice(3),
      type: 'readback',
    }
  } else {
    return message
  }
}
