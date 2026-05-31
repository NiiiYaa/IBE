// Pure, stateless helpers — no Prisma, no side effects.
// Shared between apps/api and apps/onboarding-api.

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

export interface BlockedEntryMinimal {
  domain: string
  matchType: string
  country: string | null
  redundant: boolean
}

function extractBrandLabel(hostname: string): string | null {
  const h = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  const parts = h.split('.')
  if (parts.length === 2) return parts[0] ?? null
  if (parts.length === 3) {
    if (CC_SLDS.has(parts[1]!)) return parts[0] ?? null
    if (COMMON_TLDS.has(parts[2]!)) return parts[1] ?? null
  }
  return null
}

export function detectCountryFromDomain(domain: string): string | null {
  const parts = domain.split('.')

  if (parts.length >= 3) {
    const compound = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    if (compound in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[compound]!
  }

  const tld = parts[parts.length - 1]!
  if (tld in CCTLD_TO_COUNTRY) return CCTLD_TO_COUNTRY[tld]!

  if (parts.length === 3 && COMMON_TLDS.has(parts[2]!)) {
    const prefix = parts[0]!.toLowerCase()
    if (COUNTRY_CODE_SET.has(prefix)) return prefix.toUpperCase()
  }

  return null
}

export function isRedundantEntry(domain: string, globalEntries: BlockedEntryMinimal[]): boolean {
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
