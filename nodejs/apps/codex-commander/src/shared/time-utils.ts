/**
 * Formats the game time into a 12-hour clock format with minutes.
 * Converts turn numbers (1-6) to 10-minute increments and displays
 * the time in standard 12-hour format with AM/PM.
 *
 * @param hour - Hour of the day in 24-hour format (0-23)
 * @param turn - Turn number within the hour (1-6), where each turn represents 10 minutes
 * @returns Formatted time string in 12-hour format (e.g., "02:30 PM", "09:00 AM")
 *
 * @example
 * ```ts
 * formatTime(14, 3) // "02:20 PM"
 * formatTime(0, 1)  // "12:00 AM"
 * formatTime(23, 6) // "11:50 PM"
 * ```
 */
export const formatTime = (hour: number, turn: number): string => {
  // Convert turn (1-6) to minutes (0, 10, 20, 30, 40, 50)
  const minutes = (turn - 1) * 10

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
