/**
 * Derives a RegExp from bookingTemplate that captures {solutionId} from real page URLs.
 *
 * Only the portion of the template up to (and including) {solutionId} is used —
 * robust against different query-param orderings on real pages.
 *
 * Returns null when the template has no {solutionId} token (no scraping needed).
 */
export function deriveBookingLinkRegex(bookingTemplate: string): RegExp | null {
  const marker = '{solutionId}'
  const idx = bookingTemplate.indexOf(marker)
  if (idx === -1) return null

  const prefix = bookingTemplate.slice(0, idx + marker.length)

  // Escape all regex special chars, then replace our token markers
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, c => `\\${c}`)

  const pattern = escaped
    .replace(/\\\{solutionId\\\}/g, '([^/?&#]+)')
    .replace(/\\\{[^}\\]+\\\}/g, '[^/?&#]*')

  return new RegExp('^' + pattern)
}
