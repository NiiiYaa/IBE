/**
 * Date utility functions used across the IBE.
 * All functions are pure and have no side effects.
 */

/**
 * Returns the number of nights between two YYYY-MM-DD date strings.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const msPerDay = 86_400_000
  return (Date.parse(checkOut) - Date.parse(checkIn)) / msPerDay
}

/**
 * Formats a YYYY-MM-DD string to a locale-aware display string.
 */
export function formatDate(isoDate: string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString(locale, options ?? { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Calculates the effective cancellation deadline datetime string
 * based on check-in date, timeSetting, and cancellationDeadlineHour.
 *
 * Returns an ISO-like local datetime string: "YYYY-MM-DD HH:MM:SS"
 */
export function calculateCancellationDeadline(
  checkIn: string,
  timeFromCheckIn: number,
  timeFromCheckInType: 'hours' | 'days',
  deadlineHour: string | undefined,
): string {
  const [hourStr, minuteStr] = (deadlineHour || '00:00').split(':') as [string, string]
  const [year, month, day] = checkIn.split('-').map(Number) as [number, number, number]

  // Start from check-in date at the specified deadline hour
  const pivot = new Date(year, month - 1, day, parseInt(hourStr, 10), parseInt(minuteStr, 10), 0)

  // Subtract the offset
  if (timeFromCheckInType === 'hours') {
    pivot.setHours(pivot.getHours() - timeFromCheckIn)
  } else {
    pivot.setDate(pivot.getDate() - timeFromCheckIn)
  }

  const y = pivot.getFullYear()
  const m = String(pivot.getMonth() + 1).padStart(2, '0')
  const d = String(pivot.getDate()).padStart(2, '0')
  const h = String(pivot.getHours()).padStart(2, '0')
  const min = String(pivot.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}:00`
}

/**
 * Returns today's date as a YYYY-MM-DD string.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Adds N days to a YYYY-MM-DD string and returns the result.
 */
export function addDays(isoDate: string, days: number): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
