import { prisma } from '../db/client.js'
export { detectCountryFromDomain, isRedundantEntry } from '@ibe/shared'

export interface BlockedEntry {
  domain: string
  matchType: string
  country: string | null // null = Global; ISO-2 = country-specific
  redundant: boolean
}

let cache: BlockedEntry[] = []
let loadedAt = 0
const TTL_MS = 5 * 60 * 1000

export async function getBlockedDomains(): Promise<BlockedEntry[]> {
  if (Date.now() - loadedAt > TTL_MS) {
    cache = await prisma.onboardingBlockedDomain.findMany({
      select: { domain: true, matchType: true, country: true, redundant: true },
    })
    loadedAt = Date.now()
  }
  return cache
}

export function getCachedBlockedDomains(): BlockedEntry[] {
  return cache
}

export function invalidateBlockedDomainsCache() {
  loadedAt = 0
}

const CC_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go'])
const COMMON_TLDS = new Set(['com', 'net', 'org', 'io', 'travel', 'hotel'])

function extractBrandLabel(hostname: string): string | null {
  const h = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  const parts = h.split('.')
  if (parts.length === 2) return parts[0] ?? null
  if (parts.length === 3) {
    if (CC_SLDS.has(parts[1]!)) return parts[0] ?? null          // e.g. trip.co.uk → 'trip'
    if (COMMON_TLDS.has(parts[2]!)) return parts[1] ?? null      // e.g. fr.trip.com → 'trip'
    if (parts[2]!.length === 2) return parts[1] ?? null           // e.g. aaa.booking.fr → 'booking'
  }
  return null
}

export function isBlockedByList(
  url: string,
  entries: BlockedEntry[],
  searchCountry?: string, // ISO-2 or full country name from search form
): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const e of entries) {
      if (e.redundant) continue
      // Country filter: skip if entry is country-specific and doesn't match search country
      if (e.country && searchCountry) {
        const sc = searchCountry.toLowerCase()
        if (e.country.toLowerCase() !== sc.slice(0, 2) && !sc.startsWith(e.country.toLowerCase())) continue
      }
      switch (e.matchType) {
        case 'exact':
          if (hostname === e.domain) return true
          break
        case 'subdomain':
          if (hostname === e.domain || hostname.endsWith('.' + e.domain)) return true
          break
        case 'brand': {
          const label = extractBrandLabel(hostname)
          if (label === e.domain) return true
          break
        }
        case 'keyword':
          if (hostname.includes(e.domain)) return true
          break
      }
    }
    return false
  } catch { return false }
}
