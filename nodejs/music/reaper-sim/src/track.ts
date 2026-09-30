import { randomUUID } from 'node:crypto'

/**
 * A track: a ReaScript `MediaTrack` handle and the properties the simulator models.
 */
export class SimTrack {
  readonly guid = `{${randomUUID().toUpperCase()}}`
  name = ''
  /**
   * `I_RECINPUT`: the record input, encoded as REAPER encodes it.
   */
  recordInput = 0
  /**
   * `I_RECARM`: 1 when armed.
   */
  recordArm = 0
  /**
   * `I_RECMON`: 0 off, 1 on, 2 auto.
   */
  recordMonitor = 1
  /**
   * `I_NCHAN`: the track's channel count.
   */
  channels = 2
}

/**
 * The `GetMediaTrackInfo_Value` / `SetMediaTrackInfo_Value` parameters the simulator models.
 */
const VALUES = {
  I_RECINPUT: 'recordInput',
  I_RECARM: 'recordArm',
  I_RECMON: 'recordMonitor',
  I_NCHAN: 'channels',
} as const satisfies Record<string, keyof SimTrack>

export type TrackValue = keyof typeof VALUES

export const isTrackValue = (parameter: string): parameter is TrackValue => parameter in VALUES

export const trackValueProperty = (parameter: TrackValue) => VALUES[parameter]
