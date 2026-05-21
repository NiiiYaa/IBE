import type { Page } from 'playwright'
import { logger } from '../utils/logger.js'
import { prisma } from '../db/client.js'
import { buildExternalUrl } from './external-ibe.service.js'
import { withStealthPage } from './playwright-browser.service.js'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { getEffectiveSearchParams, listCompetitors } from './compset.service.js'
import { refreshPropertyEvents } from './event-calendar-fetch.service.js'
import type { CompSetSearchParam } from '@ibe/shared'

export interface RoomRate {
  roomName: string
  board: string
  cancellation: string
  pricePerNight: number
  total: number
  currency: string
}

export function deriveCancellation(
  policies: Array<{ daysBefore: number; penaltyType: string; amount: number }>,
): string {
  if (policies.length === 0) return 'Flexi'
  const hasGracePeriod = policies.some(p => p.daysBefore > 0)
  return hasGracePeriod ? 'Flexi' : 'NR'
}

type RateExtractor = (page: Page) => Promise<RoomRate[]>

const IBE_EXTRACTORS: Record<string, RateExtractor> = {}

async function extractRatesWithAI(page: Page, orgId: number | null): Promise<RoomRate[]> {
  const aiConfig = await resolveAIConfig(undefined, orgId ?? undefined)
  if (!aiConfig) return []

  const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 8000))

  const systemPrompt = 'You are a hotel rate extractor. Return only valid JSON with no surrounding text.'
  const userPrompt = `Extract all available room rates from this hotel booking page text.
Return a JSON array of objects. Each object must have exactly these keys:
- roomName (string)
- board (one of: RO, BB, HB, FB, AI)
- cancellation (one of: NR, Flexi)
- pricePerNight (number)
- total (number)
- currency (3-letter ISO code)

Page text:
${visibleText}

Return only the JSON array, no surrounding text.`

  try {
    const adapter = getProviderAdapter(aiConfig.provider)
    const response = await adapter.call(
      [{ role: 'user', content: userPrompt }],
      [],
      systemPrompt,
      aiConfig.apiKey,
      aiConfig.model,
    )
    if (response.stopReason === 'error' || !response.text) return []
    const jsonText = response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(jsonText) as unknown
    return Array.isArray(parsed) ? (parsed as RoomRate[]) : []
  } catch {
    return []
  }
}

function resolveDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]!
}

async function fetchOwnRates(propertyId: number, param: CompSetSearchParam): Promise<RoomRate[]> {
  const checkIn = resolveDate(param.offsetDays)
  const checkOut = resolveDate(param.offsetDays + param.nights)

  const response = await searchAvailability({
    hotelId: propertyId,
    checkIn,
    checkOut,
    rooms: [{ adults: param.adults }],
    nationality: param.countryCode,
  })

  const result = response.results.find(r => r.propertyId === propertyId)
  if (!result) return []

  const rates: RoomRate[] = []
  for (const room of result.rooms) {
    for (const rp of room.ratePlans) {
      rates.push({
        roomName: room.roomName,
        board: rp.board,
        cancellation: deriveCancellation(
          rp.cancellationPolicies.map(p => ({
            daysBefore: p.daysBefore,
            penaltyType: p.penaltyType,
            amount: p.amount,
          })),
        ),
        total: rp.prices.sell.price,
        pricePerNight: rp.prices.sell.price / param.nights,
        currency: rp.prices.sell.currency,
      })
    }
  }
  return rates
}

async function fetchCompetitorRates(searchUrl: string, orgId: number | null): Promise<RoomRate[]> {
  try {
    return await withStealthPage(searchUrl, async (page: Page) => {
      const hostname = new URL(searchUrl).hostname
      const ibeType = Object.keys(IBE_EXTRACTORS).find(k => hostname.includes(k))
      if (ibeType) {
        return await IBE_EXTRACTORS[ibeType]!(page)
      }
      return await extractRatesWithAI(page, orgId)
    })
  } catch (err) {
    logger.warn({ err, searchUrl }, '[CompSet] Playwright scrape failed')
    return []
  }
}

export async function runPropertyCompSet(propertyId: number): Promise<void> {
  logger.info({ propertyId }, '[CompSet] Starting collection run')

  const [params, competitors] = await Promise.all([
    getEffectiveSearchParams(propertyId),
    listCompetitors(propertyId),
  ])

  if (params.length === 0) {
    logger.info({ propertyId }, '[CompSet] No search params — skipping')
    return
  }

  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  const orgId = prop?.organizationId ?? null

  if (competitors.length > 0) {
    await prisma.compSetCompetitor.updateMany({
      where: { propertyId },
      data: { status: 'fetching' },
    })
  }

  await prisma.compSetResult.deleteMany({ where: { propertyId } })

  const fetchedAt = new Date()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: any[] = []

  for (const param of params) {
    const checkIn = resolveDate(param.offsetDays)
    const checkOut = resolveDate(param.offsetDays + param.nights)

    try {
      const ownRates = await fetchOwnRates(propertyId, param)
      for (const rate of ownRates) {
        toInsert.push({
          propertyId, competitorId: null, searchParamId: param.id,
          fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
          countryCode: param.countryCode, searchStatus: 'found',
          roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
          pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
        })
      }
      if (ownRates.length === 0) {
        toInsert.push({
          propertyId, competitorId: null, searchParamId: param.id,
          fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
          countryCode: param.countryCode, searchStatus: 'not_found',
          roomName: null, board: null, cancellation: null,
          pricePerNight: null, total: null, currency: null,
        })
      }
    } catch (err) {
      logger.warn({ err, propertyId, paramId: param.id }, '[CompSet] Own rates fetch failed')
      toInsert.push({
        propertyId, competitorId: null, searchParamId: param.id,
        fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
        countryCode: param.countryCode, searchStatus: 'error',
        roomName: null, board: null, cancellation: null,
        pricePerNight: null, total: null, currency: null,
      })
    }

    for (const competitor of competitors) {
      if (!competitor.searchUrl) {
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'error', errorMsg: 'No search URL configured', lastFetchAt: fetchedAt },
        })
        continue
      }

      const builtUrl = buildExternalUrl(competitor.searchUrl, {
        checkIn, checkOut, adults: param.adults,
        nights: param.nights, countryCode: param.countryCode,
      })

      try {
        const rates = await fetchCompetitorRates(builtUrl, orgId)
        for (const rate of rates) {
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: param.countryCode, searchStatus: 'found',
            roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
            pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
          })
        }
        if (rates.length === 0) {
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: param.countryCode, searchStatus: 'not_found',
            roomName: null, board: null, cancellation: null,
            pricePerNight: null, total: null, currency: null,
          })
        }
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'done', lastFetchAt: fetchedAt, errorMsg: null },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'error', lastFetchAt: fetchedAt, errorMsg: msg },
        })
      }
    }
  }

  if (toInsert.length > 0) {
    await prisma.compSetResult.createMany({ data: toInsert })
  }

  logger.info({ propertyId, rows: toInsert.length }, '[CompSet] Collection run complete')

  // Trigger event calendar refresh for the same date window (non-fatal)
  const dates = params.map(p => ({
    start: resolveDate(p.offsetDays),
    end: resolveDate(p.offsetDays + p.nights),
  }))
  const minStart = dates.reduce((min, d) => d.start < min ? d.start : min, dates[0]!.start)
  const maxEnd = dates.reduce((max, d) => d.end > max ? d.end : max, dates[0]!.end)
  await refreshPropertyEvents(propertyId, minStart, maxEnd).catch(err =>
    logger.warn({ err, propertyId }, '[EventCalendar] Post-CompSet event refresh failed (non-fatal)'),
  )
}
