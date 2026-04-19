/**
 * Currency formatting utilities.
 */

/**
 * Formats a monetary amount using Intl.NumberFormat.
 */
export function formatCurrency(amount: number, currency: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Rounds a number to 2 decimal places (monetary precision).
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
