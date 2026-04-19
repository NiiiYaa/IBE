/**
 * Pure date helpers for the calendar dropdown.
 * All functions operate on YYYY-MM-DD or YYYY-MM strings and are timezone-safe.
 */

export function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function addMonths(ym: string, n: number): string {
  let [year, month] = ym.split('-').map(Number) as [number, number]
  month += n
  while (month > 12) { month -= 12; year++ }
  while (month < 1)  { month += 12; year-- }
  return `${year}-${String(month).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Returns 0 (Sunday) – 6 (Saturday) for the first day of the given month. */
export function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
}

/** Formats a YYYY-MM-DD string as "Mon, May 27". */
export function displayDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
