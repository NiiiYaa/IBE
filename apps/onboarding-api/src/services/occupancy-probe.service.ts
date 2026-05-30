/**
 * Common occupancy probing service.
 *
 * Determines room occupancy limits and age thresholds by systematically
 * searching with different adult counts and child ages.
 *
 * Used by: D-Edge, SynXis, direct-book, and any future harvester.
 */

export interface AgePricePoint {
  age: number
  found: boolean
  lowestPrice: number | null
  priceChangedFromBase: boolean
}

export interface OccupancyProbeResult {
  maxAdults: number
  maxChildren: number
  maxInfants: number
  maxOccupancy: number
  /** First age classified as child (i.e. infant age ends at childAgeFrom - 1) */
  childAgeFrom: number | null
  /** Last age classified as child (i.e. adult age starts at childAgeTo + 1) */
  childAgeTo: number | null
  /** Max age classified as infant */
  infantAgeTo: number | null
  /** First age classified as adult */
  adultAgeFrom: number | null
  /** Full age-by-age breakdown: 2 adults + 1 child aged 0-17 */
  agePricePoints: AgePricePoint[]
}

/**
 * Callback the harvester must implement.
 * @param adults    number of adults
 * @param children  array of child ages (e.g. [5, 8]). Empty array = no children.
 * @returns object with found (rooms returned) and lowestPrice (to detect price changes)
 */
export type OccupancySearchFn = (adults: number, children: number[]) => Promise<{ found: boolean; lowestPrice?: number | null }>

const ADULT_PROBE_COUNTS = [1, 2, 3, 4, 5, 6]
const CHILD_AGES_TO_PROBE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

export async function probeOccupancy(
  search: OccupancySearchFn,
  onProgress: (msg: string) => void,
): Promise<OccupancyProbeResult> {
  const result: OccupancyProbeResult = {
    maxAdults: 2, maxChildren: 0, maxInfants: 0, maxOccupancy: 2,
    childAgeFrom: null, childAgeTo: null, infantAgeTo: null, adultAgeFrom: null,
    agePricePoints: [],
  }

  // Base search: 2A + 0 children (d+30, 1 night)
  const base = await search(2, [])
  const basePrice = base.lowestPrice ?? null
  onProgress(`Probing age thresholds (2A + 1 child aged 0→17, d+30)...`)

  // 19 searches: 2A + 1 child aged 0 to 17, plus 2A alone for baseline
  const points: AgePricePoint[] = []
  for (const age of CHILD_AGES_TO_PROBE) {
    const r = await Promise.race([
      search(2, [age]),
      new Promise<{ found: boolean; lowestPrice: number | null }>(resolve =>
        setTimeout(() => resolve({ found: false, lowestPrice: null }), 20000)
      ),
    ])
    const priceChanged = basePrice !== null && r.lowestPrice !== null && Math.abs((r.lowestPrice ?? 0) - basePrice) > 0.5
    points.push({ age, found: r.found, lowestPrice: r.lowestPrice ?? null, priceChangedFromBase: priceChanged })
    const summary = r.found ? `✓${r.lowestPrice ? ` €${r.lowestPrice}${priceChanged ? ' ← price change' : ''}` : ''}` : '✗'
    onProgress(`  → age ${age}: ${summary}`)
  }
  result.agePricePoints = points

  const accepted = points.filter(p => p.found)
  onProgress(`  → Ages returning results: ${accepted.map(p => p.age).join(', ') || 'none'}`)

  if (accepted.length > 0) {
    const priceChanges = accepted.filter(p => p.priceChangedFromBase)
    if (priceChanges.length > 0) {
      onProgress(`  → Price changes at ages: ${priceChanges.map(p => `${p.age}(€${p.lowestPrice})`).join(', ')}`)
    }

    // Detect infant boundary: gap between accepted ages or price=0/same as base
    const firstAccepted = accepted[0]!.age
    const lastAccepted = accepted[accepted.length - 1]!.age

    // If age 0 returns results but with no price change → infant (free)
    if (points[0]?.found && !points[0]?.priceChangedFromBase) {
      const infantEnd = accepted.find(p => p.priceChangedFromBase || !accepted.find(q => q.age === p.age + 1 && !p.priceChangedFromBase))
      result.infantAgeTo = infantEnd ? infantEnd.age - 1 : (firstAccepted < lastAccepted ? firstAccepted : null)
      result.childAgeFrom = result.infantAgeTo !== null ? result.infantAgeTo + 1 : firstAccepted
    } else {
      result.childAgeFrom = firstAccepted
    }

    result.childAgeTo = lastAccepted
    result.adultAgeFrom = lastAccepted + 1
    result.maxChildren = 1
    result.maxOccupancy = 2 + 1

    onProgress(`  → Infant: 0–${result.infantAgeTo ?? 'n/a'} | Child: ${result.childAgeFrom}–${result.childAgeTo} | Adult from: ${result.adultAgeFrom}`)
  } else {
    onProgress('  → No child ages accepted by this IBE')
  }

  return result
}
