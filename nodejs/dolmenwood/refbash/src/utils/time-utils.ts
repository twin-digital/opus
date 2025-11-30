/**
 * Formats the game time into a 12-hour clock format with minutes.
 * Displays the time in standard 12-hour format with AM/PM.
 *
 * @param hour - Hour of the day in 24-hour format (0-23)
 * @param minutes - Minutes past the hour (0-59)
 * @returns Formatted time string in 12-hour format (e.g., "02:30 PM", "09:00 AM")
 *
 * @example
 * ```ts
 * formatTime(14, 20) // "02:20 PM"
 * formatTime(0, 0)   // "12:00 AM"
 * formatTime(23, 50) // "11:50 PM"
 * ```
 */
export const formatTime = (hour: number, minutes: number): string => {
  // Convert 24-hour to 12-hour format
  const hour12 =
    hour === 0 ? 12
    : hour > 12 ? hour - 12
    : hour
  const period = hour < 12 ? 'AM' : 'PM'

  // Pad minutes with leading zero if needed
  const minutesStr = minutes.toString().padStart(2, '0')

  return `${hour12.toString().padStart(2, '0')}:${minutesStr} ${period}`
}
