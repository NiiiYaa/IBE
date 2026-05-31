import { env } from '../env.js'
import { prisma } from '../db/client.js'
import { detectKnownIBE } from '@ibe/shared'
import { isOta, scoreCandidate, type HotelCandidate } from './hotel-search-utils.js'
import { getBlockedDomains } from './blocked-domains.service.js'

async function getDfsCredentials(passedLogin?: string, passedPassword?: string): Promise<{ login: string; password: string } | null> {
  // Prefer credentials passed directly from the ibe-api (already decrypted)
  if (passedLogin && passedPassword) return { login: passedLogin, password: passedPassword }
  if (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
    return { login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD }
  }
  try {
    const cfg = await prisma.systemDataProviderConfig.findFirst({
      where: { providerType: 'dataforseo' },
    })
    if (cfg?.login && cfg?.password) return { login: cfg.login, password: cfg.password }
  } catch { /* ignore — DB may not have this table yet */ }
  return null
}

export type { HotelCandidate }

const SERP_URL = 'https://api.dataforseo.com/v3/serp/google/organic/live/regular'

interface DataForSEOItem {
  type: string
  url?: string
  title?: string
  description?: string
  website?: string       // present on knowledge_graph items
  items?: DataForSEOItem[] // present on hotels_pack / local_pack items
}

interface DataForSEOResponse {
  tasks: Array<{
    status_code: number
    result: Array<{ items: DataForSEOItem[] }>
  }>
}

async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    return res.url || url
  } catch {
    return url
  }
}

const SPAM_TITLE_PATTERNS = [
  'unofficial', 'not official', 'third party', 'third-party',
  'independent booking', 'hotel information and', 'price comparison',
  'this is not an official', 'not the official', 'disclaimer',
]

// DataForSEO location codes for common hotel destination countries.
// Default (unknown country) → 2826 (UK) which gives better coverage of European/Mediterranean
// ccTLDs than the US default, while still returning English results.
const COUNTRY_LOCATION_CODES: Record<string, number> = {
  // Europe – Western
  'united kingdom': 2826, 'uk': 2826, 'england': 2826, 'scotland': 2826, 'wales': 2826,
  'ireland': 2372, 'france': 2250, 'germany': 2276, 'spain': 2724, 'italy': 2380,
  'portugal': 2620, 'netherlands': 2528, 'belgium': 2056, 'switzerland': 2756,
  'austria': 2040, 'luxembourg': 2442, 'monaco': 2492, 'andorra': 2020,
  'liechtenstein': 2438, 'san marino': 2674, 'gibraltar': 2292,
  // Europe – Mediterranean & Southern
  'greece': 2300, 'cyprus': 2196, 'malta': 2470, 'croatia': 2191, 'slovenia': 2705,
  'montenegro': 2499, 'albania': 2008, 'north macedonia': 2807, 'kosovo': 2275,
  'bosnia and herzegovina': 2070, 'serbia': 2688,
  // Europe – Eastern & Northern
  'poland': 2616, 'czech republic': 2203, 'czechia': 2203, 'slovakia': 2703,
  'hungary': 2348, 'romania': 2642, 'bulgaria': 2100,
  'norway': 2578, 'sweden': 2752, 'denmark': 2208, 'finland': 2246, 'iceland': 2352,
  'estonia': 2233, 'latvia': 2428, 'lithuania': 2440, 'belarus': 2112,
  'ukraine': 2804, 'moldova': 2498, 'russia': 2643,
  // Middle East
  'uae': 2784, 'united arab emirates': 2784, 'dubai': 2784, 'abu dhabi': 2784,
  'saudi arabia': 2682, 'qatar': 2634, 'bahrain': 2048, 'kuwait': 2414, 'oman': 2512,
  'israel': 2376, 'jordan': 2400, 'lebanon': 2422, 'iraq': 2368, 'iran': 2364,
  'syria': 2760, 'yemen': 2887, 'palestine': 2275,
  // Africa
  'egypt': 2818, 'morocco': 2504, 'tunisia': 2788, 'algeria': 2012, 'libya': 2434,
  'south africa': 2710, 'kenya': 2404, 'tanzania': 2834, 'ethiopia': 2231,
  'ghana': 2288, 'nigeria': 2566, 'senegal': 2686, 'cameroon': 2120,
  'ivory coast': 2384, 'mozambique': 2508, 'zambia': 2894, 'zimbabwe': 2716,
  'botswana': 2072, 'namibia': 2516, 'rwanda': 2646, 'uganda': 2800,
  'mauritius': 2480, 'seychelles': 2690, 'cape verde': 2132, 'cabo verde': 2132,
  'madagascar': 2450, 'mali': 2466, 'djibouti': 2262, 'reunion': 2638,
  // Asia – East
  'japan': 2392, 'south korea': 2410, 'china': 2156, 'hong kong': 2344, 'taiwan': 2158,
  'macau': 2446, 'mongolia': 2496,
  // Asia – South & Southeast
  'india': 2356, 'sri lanka': 2144, 'maldives': 2462, 'nepal': 2524, 'bhutan': 2064,
  'pakistan': 2586, 'bangladesh': 2050, 'afghanistan': 2004,
  'thailand': 2764, 'vietnam': 2704, 'cambodia': 2116, 'laos': 2418,
  'indonesia': 2360, 'bali': 2360, 'myanmar': 2104, 'timor-leste': 2626,
  'malaysia': 2458, 'singapore': 2702, 'philippines': 2608, 'brunei': 2096,
  // Central & South Asia
  'kazakhstan': 2398, 'uzbekistan': 2860, 'kyrgyzstan': 2417, 'tajikistan': 2762,
  'turkmenistan': 2795, 'georgia': 2268, 'armenia': 2051, 'azerbaijan': 2031,
  // Turkey
  'turkey': 2792, 'türkiye': 2792,
  // Americas
  'united states': 2840, 'usa': 2840, 'us': 2840,
  'canada': 2124, 'mexico': 2484, 'brazil': 2076, 'argentina': 2032,
  'colombia': 2170, 'peru': 2604, 'chile': 2152, 'ecuador': 2218,
  'bolivia': 2068, 'paraguay': 2600, 'uruguay': 2858, 'venezuela': 2862,
  'costa rica': 2188, 'panama': 2591, 'guatemala': 2320, 'honduras': 2340,
  'el salvador': 2222, 'nicaragua': 2558, 'belize': 2084,
  'dominican republic': 2214, 'cuba': 2192, 'jamaica': 2388, 'haiti': 2332,
  'bahamas': 2044, 'barbados': 2052, 'trinidad and tobago': 2780, 'trinidad': 2780,
  'aruba': 2533, 'curacao': 2531, 'sint maarten': 2534, 'cayman islands': 2136,
  'turks and caicos islands': 2796, 'british virgin islands': 2092,
  'saint lucia': 2662, 'saint kitts and nevis': 2659,
  'saint vincent and the grenadines': 2670, 'grenada': 2308, 'dominica': 2212,
  'antigua and barbuda': 2028, 'montserrat': 2500,
  'guadeloupe': 2312, 'martinique': 2474, 'puerto rico': 2630,
  'suriname': 2740, 'guyana': 2328, 'french guiana': 2254,
  // Pacific & Oceania
  'australia': 2036, 'new zealand': 2554, 'fiji': 2242, 'papua new guinea': 2598,
  'french polynesia': 2258, 'tahiti': 2258, 'new caledonia': 2540,
  'vanuatu': 2548, 'solomon islands': 2090, 'samoa': 2882, 'tonga': 2776,
  'cook islands': 2184, 'palau': 2585, 'micronesia': 2583, 'kiribati': 2296,
}

function locationCodeForCountry(country: string): number {
  return COUNTRY_LOCATION_CODES[country.toLowerCase().trim()] ?? 2826 // default: UK
}

async function fetchSerpItems(
  keyword: string,
  credentials: string,
  locationCode: number,
): Promise<DataForSEOItem[]> {
  try {
    const res = await fetch(SERP_URL, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ keyword, location_code: locationCode, language_code: 'en', depth: 20 }]),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const data = await res.json() as DataForSEOResponse
    const task = data.tasks?.[0]
    if (!task || task.status_code !== 20000) return []
    return task.result?.[0]?.items ?? []
  } catch {
    return []
  }
}

function extractKnowledgeGraphWebsite(items: DataForSEOItem[]): string | null {
  for (const item of items) {
    if (item.type === 'knowledge_graph' && item.website) return item.website
    if ((item.type === 'hotels_pack' || item.type === 'local_pack') && item.items) {
      for (const sub of item.items) {
        if (sub.website) return sub.website
      }
    }
  }
  return null
}

export async function searchHotelsDataForSEO(
  hotelName: string,
  city: string,
  country: string,
  passedLogin?: string,
  passedPassword?: string,
): Promise<HotelCandidate[]> {
  const dfsCredentials = await getDfsCredentials(passedLogin, passedPassword)
  if (!dfsCredentials) {
    console.warn('[DFS] No credentials found (env or DB) — skipping DataForSEO search')
    return []
  }

  await getBlockedDomains() // warm the cache; isOta() reads from it synchronously
  const credentials = Buffer.from(`${dfsCredentials.login}:${dfsCredentials.password}`).toString('base64')
  const locationCode = locationCodeForCountry(country)

  const location = [city, country].filter(Boolean).join(' ')
  const exclusions = '-site:booking.com -site:tripadvisor.com -site:expedia.com -site:agoda.com -site:airbnb.com -site:hotels.com -site:trip.com -site:ctrip.com'

  // Start with quoted (exact phrase) — high precision.
  // Only fire unquoted if quoted returns fewer than 2 non-OTA results.
  const quotedKeyword   = `"${hotelName}"${location ? ' ' + location : ''} ${exclusions}`
  const unquotedKeyword = `${hotelName}${location ? ' ' + location : ''} official site ${exclusions}`

  try {
    const quotedAllItems = await fetchSerpItems(quotedKeyword, credentials, locationCode)
    const kgWebsite = extractKnowledgeGraphWebsite(quotedAllItems)
    const quotedItems = quotedAllItems.filter(i => i.type === 'organic' && i.url)
    const nonOtaFromQuoted = quotedItems.filter(i => i.url && !isOta(i.url, country))

    const unquotedItems = nonOtaFromQuoted.length >= 2
      ? []
      : (await fetchSerpItems(unquotedKeyword, credentials, locationCode)).filter(i => i.type === 'organic' && i.url)

    // Merge: quoted first (higher confidence), unquoted fills gaps
    const seenUrls = new Set<string>()
    const allOrganic: DataForSEOItem[] = []
    for (const item of [...quotedItems, ...unquotedItems]) {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url)
        allOrganic.push(item)
      }
    }

    // Resolve redirects in parallel — catches parked domains that redirect to GoDaddy/Sedo
    const resolved = await Promise.all(
      allOrganic.map(async item => {
        const url = item.url!
        if (isOta(url, country)) return null
        const finalUrl = await resolveRedirect(url)
        if (finalUrl !== url && isOta(finalUrl)) return null
        return item
      })
    )

    const candidates: HotelCandidate[] = []
    for (const item of resolved) {
      if (!item) continue
      const url = item.url!
      const titleLower = (item.title ?? '').toLowerCase()
      if (SPAM_TITLE_PATTERNS.some(p => titleLower.includes(p))) continue
      const detection = detectKnownIBE(url)
      const detected = detection !== null
      const score = scoreCandidate(url, item.title ?? '', hotelName, detected)
      candidates.push({ url, title: item.title ?? url, detected, ibeName: detection?.name ?? null, screenshotUrl: null, score })
    }

    // Knowledge graph website — score 97, highest confidence (Google's curated hotel data)
    if (kgWebsite && !isOta(kgWebsite, country)) {
      const kgDetection = detectKnownIBE(kgWebsite)
      candidates.push({
        url: kgWebsite,
        title: 'Official website (Google Hotels)',
        detected: kgDetection !== null,
        ibeName: kgDetection?.name ?? null,
        screenshotUrl: null,
        score: 97,
      })
    }

    // Deduplicate by base domain — keep highest-scoring result per domain
    const byDomain = new Map<string, HotelCandidate>()
    for (const c of candidates.filter(c => c.score >= 15)) {
      try {
        const domain = new URL(c.url).hostname.replace(/^www\./, '')
        const existing = byDomain.get(domain)
        if (!existing || c.score > existing.score) byDomain.set(domain, c)
      } catch { byDomain.set(c.url, c) }
    }

    return Array.from(byDomain.values())
      .sort((a, b) => {
        if (a.detected !== b.detected) return a.detected ? -1 : 1
        return b.score - a.score
      })
      .slice(0, 6)
  } catch {
    return []
  }
}
