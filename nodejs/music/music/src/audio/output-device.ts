/**
 * Selection of the audio output device the sample player opens.
 *
 * By default samples play through the system output. In the recording studio they go to a
 * virtual device (BlackHole) that REAPER records, since sound-board notes never reach the
 * piano's audio. MUSIC_SAMPLE_OUTPUT names that device by a substring of its label.
 */

export interface OutputDeviceInfo {
  kind: string
  label: string
  deviceId: string
}

export interface MediaDevicesLike {
  enumerateDevices(): Promise<OutputDeviceInfo[]>
}

export const configuredOutputDevice = (): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined
  }
  const configured = process.env.MUSIC_SAMPLE_OUTPUT?.trim()
  return configured === undefined || configured === '' ? undefined : configured
}

/**
 * Finds the sink id of the first audio output whose label contains `label` (case-insensitive),
 * or `undefined` when no such device is present.
 */
export const resolveOutputSinkId = async (
  mediaDevices: MediaDevicesLike,
  label: string,
): Promise<string | undefined> => {
  const wanted = label.toLowerCase()
  const devices = await mediaDevices.enumerateDevices()
  return devices.find((device) => device.kind === 'audiooutput' && device.label.toLowerCase().includes(wanted))
    ?.deviceId
}
