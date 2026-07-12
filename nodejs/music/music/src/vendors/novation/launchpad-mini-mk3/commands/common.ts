export const IdentityRequestHeader = [0xf0, 0x7e, 0x00, 0x06, 0x02]

export const CommandHeader = [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0d] as const
export const CommandTrailer = [0xf7] as const

/**
 * @see - Programmer's reference manual
 */
export interface BaseLaunchpadCommandConfig<T = unknown> {
  /**
   * The numeric code assigned to this function of the Launchpad.
   */
  code: number

  /**
   * Converts an array of data values into the corresponding command data object.
   * @param data Array of values to convert.
   */
  fromBytes?: ((data: number[]) => T) | undefined

  /**
   * Name of the command.
   */
  name: string

  /**
   * Whether this function supports readback or not.
   */
  readback: boolean

  /**
   * Converts a command data object into the corresponding bytes.
   * @param data Data object to convert
   */
  toBytes(data: T): number[]
}

/**
 * @see - Programmer's reference manual
 */
export interface LaunchpadCommandWithoutReadback<T = unknown> {
  /**
   * The numeric code assigned to this function of the Launchpad.
   */
  code: number

  /**
   * Name of the command.
   */
  name: string

  /**
   * Whether this function supports readback or not.
   */
  readback: false

  /**
   * Converts a command data object into the corresponding bytes.
   * @param data Data object to convert
   */
  toBytes(data: T): number[]
}

/**
 * @see - Programmer's reference manual
 */
export interface LaunchpadCommandWithReadback<T = unknown> {
  /**
   * The numeric code assigned to this function of the Launchpad.
   */
  code: number

  /**
   * Converts an array of data values into the corresponding command data object.
   * @param data Array of values to convert.
   */
  fromBytes(data: number[]): T

  /**
   * Name of the command.
   */
  name: string

  /**
   * Whether this function supports readback or not.
   */
  readback: true

  /**
   * Converts a command data object into the corresponding bytes.
   * @param data Data object to convert
   */
  toBytes(data: T): number[]
}

export type LaunchpadCommandConfig<T = unknown> = LaunchpadCommandWithReadback<T> | LaunchpadCommandWithoutReadback<T>
