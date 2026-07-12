export type ManufacturerId = [number] | [0, number, number]

export interface BaseSysExMessage {
  /**
   * The raw message.
   */
  raw: number[]

  /**
   * Type of message, which is used to interpret the "data".
   */
  type: string

  /**
   * The ID of the manufacturer for which this message applies, or "universal" for universal MIDI messages.
   */
  source: 'universal' | 'manufacturer-exclusive'
}

export interface BaseUniversalMessage extends BaseSysExMessage {
  /**
   * The raw message.
   */
  raw: number[]

  /**
   * True if this is a "realtime" message, false if it is "non-realtime".
   */
  realtime: boolean

  /**
   * The SysEx channel corresponding with this message.
   */
  sysExChannel: number

  /**
   * The ID of the manufacturer for which this message applies, or "universal" for universal MIDI messages.
   */
  source: 'universal'
}

export interface IdentityRequestMessage extends BaseUniversalMessage {
  type: 'identity-request'
}

export interface IdentityResponseMessage extends BaseUniversalMessage {
  /**
   * Two-byte sequence identifying the manufacturer-specific device family.
   */
  family: [number, number]

  /**
   * Byte sequence identifying the device manufacturer.
   */
  manufacturer: ManufacturerId

  /**
   * Two-byte sequence identifying the manufacturer-specific device model.
   */
  model: [number, number]

  type: 'identity-response'

  /**
   * Four-byte sequence identifying the manufacturer-specific device version.
   */
  version: [number, number, number, number]
}

export interface UnknownUniversalMessage extends BaseUniversalMessage {
  type: 'unknown'
}

export interface ProprietarySysExMessage extends BaseSysExMessage {
  /**
   * Message-specific data payload with the start byte, manufacturer ID, and stop byte remove.
   */
  data: number[]

  /**
   * Byte sequence identifying the device manufacturer.
   */
  manufacturer: [number] | [0, number, number]

  /**
   * The raw message as received from the device.
   */
  raw: number[]
}

export type UniversalMessage = IdentityRequestMessage | IdentityResponseMessage | UnknownUniversalMessage

export interface UnknownMessage extends ProprietarySysExMessage {
  type: 'unknown'
}

export type CommonSysExMessage = UniversalMessage | UnknownMessage

const parseUniversalMessage = (data: number[]): UniversalMessage => {
  const realtime = data[1] === 0x7f
  const channel = data[2]

  if (data[3] === 0x06 && data[4] === 0x01) {
    // identity request
    return {
      raw: data,
      realtime,
      source: 'universal',
      sysExChannel: channel,
      type: 'identity-request',
    }
  } else if (data[3] === 0x06 && data[4] === 0x02) {
    // identity reply
    const manufacturerIdLength = data[5] === 0 ? 3 : 1
    return {
      family: data.slice(5 + manufacturerIdLength, 5 + manufacturerIdLength + 2) as [number, number],
      manufacturer: data.slice(5, 5 + manufacturerIdLength) as ManufacturerId,
      model: data.slice(5 + manufacturerIdLength + 2, 5 + manufacturerIdLength + 4) as [number, number],
      raw: data,
      realtime,
      source: 'universal',
      sysExChannel: channel,
      type: 'identity-response',
      version: data.slice(5 + manufacturerIdLength + 4, 5 + manufacturerIdLength + 8) as [
        number,
        number,
        number,
        number,
      ],
    }
  } else {
    // unknown universal message
    return {
      raw: data,
      realtime,
      source: 'universal',
      sysExChannel: channel,
      type: 'unknown',
    }
  }
}

/**
 * Parsers a SysEx message received from MIDI. This method will ensure the structure is valid, and extract
 * the manufacturer ID and payload bytes for further processing.
 */
export const parseSysex = (
  data: number[],
): { message: CommonSysExMessage; valid: true } | { message: null; valid: false } => {
  const hasStartAndEndBytes = data[0] === 0xf0 && data[data.length - 1] === 0xf7
  // ensure we have at least 5 bytes (manufacturers [0, xx, xx]) or 3 bytes (manufacturers [xx])
  const manufacturerIdLength = data[1] === 0x00 ? 3 : 1

  if (!hasStartAndEndBytes || data.length < 2 + manufacturerIdLength) {
    return {
      message: null,
      valid: false,
    }
  }

  if (data[1] === 0x7e || data[1] === 0x7f) {
    return {
      message: parseUniversalMessage(data),
      valid: true,
    }
  } else {
    // manufacturer-exclusive message, which we don't parse in this function
    // return it is as "unknown"
    return {
      message: {
        data: data.slice(manufacturerIdLength + 1, -1),
        manufacturer: data.slice(1, manufacturerIdLength + 1) as [number] | [0, number, number],
        raw: data,
        source: 'manufacturer-exclusive',
        type: 'unknown',
      },
      valid: true,
    }
  }
}
