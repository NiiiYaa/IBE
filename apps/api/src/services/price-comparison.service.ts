import { prisma } from '../db/client.js'
import type { PriceComparisonOta, CreatePriceComparisonOtaRequest, UpdatePriceComparisonOtaRequest, OtaPriceResult } from '@ibe/shared'
import { scrapeOtaPrice } from './ota-scraper.service.js'
import { fetchXoteloRates } from './xotelo.service.js'

// ── URL normalisation ─────────────────────────────────────────────────────────

// Params that carry search context — stripped from stored URLs so the DB
// holds a clean base URL. Fresh values are injected at scrape time.
const SEARCH_PARAMS = [
  'checkin', 'checkout', 'check_in', 'check_out', 'checkIn', 'checkOut',
  'startDate', 'endDate', 'start_date', 'end_date',
  'group_adults', 'group_children', 'adults', 'children',
  'req_adults', 'req_children', 'no_rooms', 'rooms',
  'numberOfAdults', 'numberOfChildren', 'numberOfRooms',
  'num_adults', 'num_children',
  'age', 'req_age',      // booking.com child ages
  'selected_currency',   // booking.com
  'srepoch', 'srpvid', 'ucfs', 'hapos', 'hpos', 'sb_price_type',
  'sr_order', 'sr_pri_blocks', 'srepoch',
]

export function normaliseOtaUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return raw.trim() }
  SEARCH_PARAMS.forEach(p => url.searchParams.delete(p))
  return url.toString()
}

// ── URL building at scrape time ───────────────────────────────────────────────

export interface OtaSearchContext {
  checkin: string    // YYYY-MM-DD
  checkout: string   // YYYY-MM-DD
  adults: number
  children: number
  rooms?: number
}

export function buildOtaUrl(baseUrl: string, ctx: OtaSearchContext): string {
  let url: URL
  try { url = new URL(baseUrl) } catch { return baseUrl }

  const rooms = ctx.rooms ?? 1
  const hostname = url.hostname.replace(/^www\./, '')

  // Strip any stale search params before injecting fresh ones
  SEARCH_PARAMS.forEach(p => url.searchParams.delete(p))

  if (hostname.includes('booking.com')) {
    url.searchParams.set('checkin', ctx.checkin)
    url.searchParams.set('checkout', ctx.checkout)
    url.searchParams.set('group_adults', String(ctx.adults))
    url.searchParams.set('req_adults', String(ctx.adults))
    url.searchParams.set('group_children', String(ctx.children))
    url.searchParams.set('req_children', String(ctx.children))
    url.searchParams.set('no_rooms', String(rooms))
  } else if (hostname.includes('expedia.com') || hostname.includes('hotels.com') || hostname.includes('vrbo.com')) {
    url.searchParams.set('startDate', ctx.checkin)
    url.searchParams.set('endDate', ctx.checkout)
    url.searchParams.set('adults', String(ctx.adults))
    if (ctx.children > 0) url.searchParams.set('children', String(ctx.children))
    url.searchParams.set('rooms', String(rooms))
  } else if (hostname.includes('agoda.com')) {
    url.searchParams.set('checkIn', ctx.checkin)
    url.searchParams.set('checkOut', ctx.checkout)
    url.searchParams.set('adults', String(ctx.adults))
    url.searchParams.set('children', String(ctx.children))
    url.searchParams.set('rooms', String(rooms))
  } else if (hostname.includes('airbnb.com')) {
    url.searchParams.set('check_in', ctx.checkin)
    url.searchParams.set('check_out', ctx.checkout)
    url.searchParams.set('adults', String(ctx.adults))
    if (ctx.children > 0) url.searchParams.set('children', String(ctx.children))
  } else if (hostname.includes('tripadvisor.com')) {
    url.searchParams.set('checkin', ctx.checkin)
    url.searchParams.set('checkout', ctx.checkout)
    url.searchParams.set('adults', String(ctx.adults))
    if (ctx.children > 0) url.searchParams.set('children', String(ctx.children))
    url.searchParams.set('rooms', String(rooms))
  } else {
    // Generic fallback
    url.searchParams.set('checkin', ctx.checkin)
    url.searchParams.set('checkout', ctx.checkout)
    url.searchParams.set('adults', String(ctx.adults))
    if (ctx.children > 0) url.searchParams.set('children', String(ctx.children))
    if (rooms > 1) url.searchParams.set('rooms', String(rooms))
  }

  return url.toString()
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function toResponse(row: { id: number; name: string; url: string; isEnabled: boolean; createdAt: Date }): PriceComparisonOta {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listPriceComparisonOtas(organizationId: number): Promise<PriceComparisonOta[]> {
  const rows = await prisma.priceComparisonOta.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toResponse)
}

export async function createPriceComparisonOta(organizationId: number, data: CreatePriceComparisonOtaRequest): Promise<PriceComparisonOta> {
  const row = await prisma.priceComparisonOta.create({
    data: {
      organizationId,
      name: data.name.trim(),
      url: normaliseOtaUrl(data.url),
      isEnabled: data.isEnabled ?? true,
    },
  })
  return toResponse(row)
}

export async function updatePriceComparisonOta(organizationId: number, id: number, data: UpdatePriceComparisonOtaRequest): Promise<PriceComparisonOta> {
  const row = await prisma.priceComparisonOta.update({
    where: { id, organizationId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.url !== undefined && { url: normaliseOtaUrl(data.url) }),
      ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
    },
  })
  return toResponse(row)
}

export async function deletePriceComparisonOta(organizationId: number, id: number): Promise<void> {
  await prisma.priceComparisonOta.update({ where: { id, organizationId }, data: { deletedAt: new Date(), isEnabled: false } })
}

// ── Price comparison results with cache ───────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 60 * 1000      // 2h for successful scrapes
const CACHE_FAIL_TTL_MS = 5 * 60 * 1000       // 5m retry window for failed scrapes

// Track in-flight scrapes so concurrent polls don't trigger duplicate browser launches
const inFlight = new Set<string>()

function makeCacheKey(otaId: number, ctx: OtaSearchContext): string {
  return `${otaId}:${ctx.checkin}:${ctx.checkout}:${ctx.adults}:${ctx.children}`
}

export async function getPriceComparisonResults(
  ctx: OtaSearchContext,
  propertyId?: number,
): Promise<OtaPriceResult[]> {
  // ── Xotelo path (preferred) ────────────────────────────────────────────────
  if (propertyId) {
    const config = await prisma.hotelConfig.findUnique({ where: { propertyId }, select: { tripadvisorHotelKey: true } })
    if (config?.tripadvisorHotelKey) {
      const cacheKey = `xotelo:${config.tripadvisorHotelKey}:${ctx.checkin}:${ctx.checkout}`
      const now = new Date()
      const cached = await prisma.priceComparisonCache.findUnique({ where: { cacheKey } })

      if (cached && cached.expiresAt > now && cached.price !== null) {
        // Cache stores a JSON-encoded list in the currency field when using Xotelo
        try {
          return JSON.parse(cached.currency) as OtaPriceResult[]
        } catch { /* fall through to re-fetch */ }
      }

      if (!inFlight.has(cacheKey)) {
        inFlight.add(cacheKey)
        void fetchXoteloRates(config.tripadvisorHotelKey, ctx.checkin, ctx.checkout).then(async (rates) => {
          try {
            const expiresAt = new Date(Date.now() + (rates.length > 0 ? CACHE_TTL_MS : CACHE_FAIL_TTL_MS))
            await prisma.priceComparisonCache.upsert({
              where: { cacheKey },
              update: { price: rates.length > 0 ? 1 : null, currency: JSON.stringify(rates), fetchedAt: new Date(), expiresAt },
              create: { otaId: 0, cacheKey, price: rates.length > 0 ? 1 : null, currency: JSON.stringify(rates), fetchedAt: new Date(), expiresAt },
            })
          } finally {
            inFlight.delete(cacheKey)
          }
        })
      }

      // Return pending if not cached yet
      return [{ otaId: 0, otaName: '', price: null, currency: 'USD', status: 'pending' }]
    }
  }

  // ── Playwright fallback (when no TripAdvisor key configured) ────────────────
  const orgId = propertyId
    ? (await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }))?.organizationId
    : undefined
  const otas = await prisma.priceComparisonOta.findMany({
    where: { isEnabled: true, deletedAt: null, ...(orgId !== undefined && { organizationId: orgId }) },
    orderBy: { createdAt: 'asc' },
  })
  if (otas.length === 0) return []

  const now = new Date()
  const results: OtaPriceResult[] = []
  const toScrape: typeof otas = []

  for (const ota of otas) {
    const cacheKey = makeCacheKey(ota.id, ctx)
    const cached = await prisma.priceComparisonCache.findUnique({ where: { cacheKey } })

    if (cached && cached.expiresAt > now) {
      results.push({
        otaId: ota.id,
        otaName: ota.name,
        price: cached.price !== null ? Number(cached.price) : null,
        currency: cached.currency,
        status: cached.price !== null ? 'ok' : 'failed',
      })
    } else if (inFlight.has(cacheKey)) {
      results.push({ otaId: ota.id, otaName: ota.name, price: null, currency: 'USD', status: 'pending' })
    } else {
      results.push({ otaId: ota.id, otaName: ota.name, price: null, currency: 'USD', status: 'pending' })
      toScrape.push(ota)
    }
  }

  if (toScrape.length > 0) {
    toScrape.forEach(ota => inFlight.add(makeCacheKey(ota.id, ctx)))
    void scrapeAndCache(toScrape, ctx)
  }

  return results
}

async function scrapeAndCache(
  otas: Array<{ id: number; name: string; url: string }>,
  ctx: OtaSearchContext,
): Promise<void> {
  await Promise.allSettled(
    otas.map(async (ota) => {
      const cacheKey = makeCacheKey(ota.id, ctx)
      try {
        const url = buildOtaUrl(ota.url, ctx)
        const { price, currency } = await scrapeOtaPrice(url)
        const expiresAt = new Date(Date.now() + (price !== null ? CACHE_TTL_MS : CACHE_FAIL_TTL_MS))
        await prisma.priceComparisonCache.upsert({
          where: { cacheKey },
          update: { price: price ?? null, currency, fetchedAt: new Date(), expiresAt },
          create: { otaId: ota.id, cacheKey, price: price ?? null, currency, fetchedAt: new Date(), expiresAt },
        })
      } finally {
        inFlight.delete(cacheKey)
      }
    }),
  )
}
