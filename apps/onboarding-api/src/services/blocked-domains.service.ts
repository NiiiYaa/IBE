import { prisma } from '../db/client.js'

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

const COUNTRY_CODE_SET = new Set([
  'ae','ar','at','au','be','bg','br','ca','ch','cl','cn','co','cz','de',
  'dk','ee','eg','es','fi','fr','gb','gr','hk','hr','hu','id','ie','il',
  'in','it','jp','ke','kr','lt','lv','ma','mx','my','ng','nl','no','nz',
  'ph','pl','pt','ro','rs','ru','sa','se','sg','si','sk','th','tr','tw',
  'ua','us','vn','za',
])

const CCTLD_TO_COUNTRY: Record<string, string> = {
  fr:'FR', de:'DE', it:'IT', es:'ES', pt:'PT', nl:'NL', be:'BE', ch:'CH',
  at:'AT', pl:'PL', se:'SE', no:'NO', dk:'DK', fi:'FI', ie:'IE', gr:'GR',
  cz:'CZ', hu:'HU', ro:'RO', sk:'SK', hr:'HR', rs:'RS', bg:'BG', lt:'LT',
  lv:'LV', ee:'EE', si:'SI', ru:'RU', ua:'UA', tr:'TR', ae:'AE', il:'IL',
  sa:'SA', eg:'EG', ma:'MA', za:'ZA', ng:'NG', ke:'KE', in:'IN', cn:'CN',
  jp:'JP', kr:'KR', tw:'TW', hk:'HK', sg:'SG', th:'TH', id:'ID', my:'MY',
  ph:'PH', vn:'VN', au:'AU', nz:'NZ', br:'BR', ar:'AR', mx:'MX', cl:'CL',
  co:'CO', ca:'CA', us:'US', uk:'GB',
  'co.uk':'GB', 'co.nz':'NZ', 'co.jp':'JP', 'co.za':'ZA', 'co.id':'ID',
  'co.kr':'KR', 'co.th':'TH', 'com.br':'BR', 'com.ar':'AR', 'com.mx':'MX',
  'com.au':'AU', 'com.sg':'SG', 'com.tr':'TR', 'com.eg':'EG', 'com.sa':'SA',
  'com.co':'CO', 'com.pe':'PE', 'com.vn':'VN', 'com.ph':'PH', 'com.my':'MY',
  'net.br':'BR', 'org.br':'BR',
}

export function detectCountryFromDomain(domain: string): string | null {
  const parts = domain.split('.')

  // 1. Compound ccTLD (last two parts): co.uk, com.br, com.ar …
  if (parts.length >= 3) {
    const compound = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    if (compound in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[compound]!
  }

  // 2. Simple ccTLD (last part): .fr, .de, .br …
  const tld = parts[parts.length - 1]!
  if (tld in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[tld]!

  // 3. Country-prefix subdomain: ar.trivago.com — only for 3-part domains with COMMON_TLDS
  if (parts.length === 3 && COMMON_TLDS.has(parts[2]!)) {
    const prefix = parts[0]!.toLowerCase()
    if (COUNTRY_CODE_SET.has(prefix)) return prefix.toUpperCase()
  }

  return null
}

export function isRedundantEntry(domain: string, globalEntries: BlockedEntry[]): boolean {
  try {
    const hostname = domain.toLowerCase().replace(/^www\./, '')
    for (const e of globalEntries) {
      if (e.redundant || e.country !== null) continue
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

function extractBrandLabel(hostname: string): string | null {
  const h = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  const parts = h.split('.')
  if (parts.length === 2) return parts[0] ?? null
  if (parts.length === 3) {
    if (CC_SLDS.has(parts[1]!)) return parts[0] ?? null     // e.g. trip.co.uk → 'trip'
    if (COMMON_TLDS.has(parts[2]!)) return parts[1] ?? null // e.g. fr.trip.com → 'trip'
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
