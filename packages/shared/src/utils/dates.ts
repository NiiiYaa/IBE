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
  if (options) return date.toLocaleDateString(locale, options)
  const monthName = date.toLocaleDateString(locale, { month: 'long' })
  return `${day}-${monthName}-${year}`
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

function formatDeadlineDatetime(isoDatetime: string, locale: string): string {
  const [datePart, timePart] = isoDatetime.split('T') as [string, string | undefined]
  const dateStr = formatDate(datePart, locale)
  const time = (timePart ?? '').slice(0, 5) // "HH:MM"
  if (!time || time === '00:00') return dateStr
  const [hourStr, minuteStr] = time.split(':') as [string, string]
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${dateStr} at ${hour12}:${minuteStr}${ampm}`
}

/**
 * Formats a cancellation deadline for the free-cancellation label.
 * Appends "local time" when a time component is present.
 */
export function formatCancellationDeadline(isoDatetime: string, locale: string): string {
  const base = formatDeadlineDatetime(isoDatetime, locale)
  return base.includes(' at ') ? `${base} local time` : base
}

/**
 * Formats a penalty amount into a human-readable string.
 * penaltyType: 'currency' | 'percent' | 'nights'
 */
export function formatPenaltyAmount(
  penaltyType: string,
  penaltyAmount: number,
  locale: string,
  currency: string,
): string {
  if (penaltyType === 'percent') return `${penaltyAmount}% of stay`
  if (penaltyType === 'nights') return `${penaltyAmount} night${penaltyAmount !== 1 ? 's' : ''} charged`
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(penaltyAmount)
}

/**
 * Formats a penalty cancellation tier as "After [date/time]: [penalty description]".
 */
export function formatCancellationPenalty(
  isoDatetime: string,
  penaltyType: string,
  penaltyAmount: number,
  locale: string,
  currency: string,
): string {
  const dateStr = formatDeadlineDatetime(isoDatetime, locale)
  return `After ${dateStr}: ${formatPenaltyAmount(penaltyType, penaltyAmount, locale, currency)}`
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
