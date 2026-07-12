/**
 * Given a numeric value, normalize it for transmission to a MIDI device:
 *
 * - If the value is less than 0, convert it to 0
 * - If the value is greater than 127, convert it to 127
 * - If the value is not an integer, round it
 *
 * @param value The value to normalize.
 */
export const normalizeMidiByte = (value: number): number => Math.max(0, Math.min(127, Math.round(value)))
