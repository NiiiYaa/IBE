import type { Page } from 'playwright'
import { logger } from '../utils/logger.js'
import { prisma } from '../db/client.js'
import { buildExternalUrl } from './external-ibe.service.js'
import { withStealthPage } from './playwright-browser.service.js'
import { searchAvailability } from '../adapters/hyperguest/search.js'
import { resolveAIConfig } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { getEffectiveSearchParams, listCompetitors } from './compset.service.js'
import { getRunStatus, setRunStatus, getCompetitorRunStatus, setCompetitorRunStatus } from './compset-run-status.js'
import { refreshPropertyEvents } from './event-calendar-fetch.service.js'
import { getSystemEventCalendarConfig } from './event-calendar.service.js'
import { detectKnownIBE } from '@ibe/shared'
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

type RateExtractor = (page: Page, orgId: number | null) => Promise<RoomRate[]>

async function extractSentecRates(page: Page, orgId: number | null): Promise<RoomRate[]> {
  // Detect cookie-consent banner. If present, pre-set common consent tokens in
  // localStorage/cookies and reload — so the booking widget initialises with URL
  // params and no consent modal on the second render.
  const hadConsentModal = await page.evaluate(() => {
    const text = document.body.innerText
    if (!/enable.*services|cookie.*consent|cookie.*preference/i.test(text)) return false
    try {
      localStorage.setItem('CookieConsent', 'true')
      localStorage.setItem('cookieconsent_status', 'dismiss')
      localStorage.setItem('cookie_consent', 'accepted')
      localStorage.setItem('consent_given', 'true')
      document.cookie = 'CookieConsent=true; path=/'
      document.cookie = 'cookieconsent_status=dismiss; path=/'
    } catch { /* storage blocked */ }
    return true
  })

  if (hadConsentModal) {
    // Reload the same URL — consent tokens are now set so the modal should not appear.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(5000)
  }

  // If the guest selector is still showing unset child ages, fill them in from the URL
  // and click "Check Availability" so the room list renders.
  try {
    const url = new URL(page.url())
    const guestTokens = (url.searchParams.get('guests') ?? '').split(',')
    const childAges = guestTokens.filter(t => t !== 'A' && /^\d+$/.test(t)).map(Number)
    if (childAges.length > 0) {
      const ageSelects = page.locator('select').filter({ hasText: 'Select age' })
      const count = await ageSelects.count()
      for (let i = 0; i < Math.min(count, childAges.length); i++) {
        await ageSelects.nth(i).selectOption(String(childAges[i]))
      }
      if (count > 0) {
        const checkBtn = page.getByRole('button', { name: /check availability/i })
        if (await checkBtn.isVisible({ timeout: 2000 })) {
          await checkBtn.click()
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
          await page.waitForTimeout(5000)
        }
      }
    }
  } catch { /* age selectors not found or already resolved */ }

  return extractRatesWithAI(page, orgId)
}

const IBE_EXTRACTORS: Record<string, RateExtractor> = {
  'sentec': extractSentecRates,
}

// If a competitor URL has no template vars, try to expand it using the known IBE registry
function expandCompetitorUrl(rawUrl: string): string {
  if (rawUrl.includes('{')) return rawUrl // already a template
  const detected = detectKnownIBE(rawUrl)
  if (!detected?.searchTemplate || !detected.externalHotelId) return rawUrl
  return detected.searchTemplate.replaceAll('{externalHotelId}', detected.externalHotelId)
}

async function extractRatesWithAI(page: Page, orgId: number | null): Promise<RoomRate[]> {
  const aiConfig = await resolveAIConfig(undefined, orgId ?? undefined)
  if (!aiConfig) return []

  const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 15000))

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
    if (!Array.isArray(parsed)) return []
    return (parsed as Record<string, unknown>[]).map(r => ({
      roomName: String(r.roomName ?? ''),
      board: String(r.board ?? ''),
      cancellation: String(r.cancellation ?? ''),
      pricePerNight: parseFloat(String(r.pricePerNight)) || 0,
      total: parseFloat(String(r.total)) || 0,
      currency: String(r.currency ?? ''),
    }))
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
    rooms: [{ adults: param.adults, ...(param.childAges.length > 0 && { childAges: param.childAges }) }],
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
  logger.info({ searchUrl }, '[CompSet] Fetching competitor rates')
  try {
    return await withStealthPage(searchUrl, async (page: Page) => {
      // Extra wait for SPA pages that render availability data after networkidle
      await page.waitForTimeout(3000)
      const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 500))
      logger.info({ searchUrl, textSnippet: visibleText }, '[CompSet] Page text snippet')
      const hostname = new URL(searchUrl).hostname
      const ibeType = Object.keys(IBE_EXTRACTORS).find(k => hostname.includes(k))
      if (ibeType) {
        return await IBE_EXTRACTORS[ibeType]!(page, orgId)
      }
      return await extractRatesWithAI(page, orgId)
    })
  } catch (err) {
    logger.warn({ err, searchUrl }, '[CompSet] Playwright scrape failed')
    return []
  }
}

export async function runSingleCompetitor(competitorId: number): Promise<void> {
  // Set running immediately (before any await) so the status endpoint reflects it right away
  // We don't know propertyId yet, so we fetch it first synchronously-ish via a quick lookup
  const competitor = await prisma.compSetCompetitor.findUnique({ where: { id: competitorId } })
  if (!competitor) return

  const { propertyId } = competitor
  logger.info({ competitorId, propertyId }, '[CompSet] Starting single-competitor run')

  const startedAt = new Date()
  setCompetitorRunStatus(competitorId, { status: 'running', startedAt: startedAt.toISOString(), totalParams: 0, doneParams: 0, found: 0, notFound: 0, errors: 0 })

  const params = await getEffectiveSearchParams(propertyId)
  if (params.length === 0) {
    logger.info({ propertyId }, '[CompSet] No search params — skipping')
    setCompetitorRunStatus(competitorId, { status: 'done', startedAt: startedAt.toISOString(), totalParams: 0, doneParams: 0, durationSec: 0, found: 0, notFound: 0, errors: 0 })
    return
  }

  setCompetitorRunStatus(competitorId, { status: 'running', startedAt: startedAt.toISOString(), totalParams: params.length, doneParams: 0, found: 0, notFound: 0, errors: 0 })

  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  const orgId = prop?.organizationId ?? null

  await prisma.compSetCompetitor.update({
    where: { id: competitorId },
    data: { status: 'fetching' },
  })

  const fetchedAt = startedAt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: any[] = []
  let found = 0, notFound = 0, errors = 0

  for (const param of params) {
    const checkIn = resolveDate(param.offsetDays)
    const checkOut = resolveDate(param.offsetDays + param.nights)

    if (!competitor.searchUrl) {
      await prisma.compSetCompetitor.update({
        where: { id: competitorId },
        data: { status: 'error', errorMsg: 'No search URL configured', lastFetchAt: fetchedAt },
      })
      errors++
    } else {
      const guests = [
        ...Array(param.adults).fill('A'),
        ...param.childAges.map(String),
      ].join(',')
      const expandedTemplate = expandCompetitorUrl(competitor.searchUrl)
      const builtUrl = buildExternalUrl(expandedTemplate, {
        checkIn, checkOut, adults: param.adults,
        nights: param.nights, countryCode: '',
        currency: 'USD', guests,
      })
      logger.info({ raw: competitor.searchUrl, expanded: expandedTemplate, builtUrl }, '[CompSet] Built competitor URL')

      try {
        const rates = await fetchCompetitorRates(builtUrl, orgId)
        for (const rate of rates) {
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: '', searchStatus: 'found',
            roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
            pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
          })
        }
        if (rates.length === 0) {
          notFound++
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: '', searchStatus: 'not_found',
            roomName: null, board: null, cancellation: null,
            pricePerNight: null, total: null, currency: null,
          })
        } else {
          found += rates.length
        }
        await prisma.compSetCompetitor.update({
          where: { id: competitorId },
          data: { status: 'done', lastFetchAt: fetchedAt, errorMsg: null },
        })
      } catch (err) {
        errors++
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.compSetCompetitor.update({
          where: { id: competitorId },
          data: { status: 'error', lastFetchAt: fetchedAt, errorMsg: msg },
        })
      }
    }

    const prev = getCompetitorRunStatus(competitorId)
    setCompetitorRunStatus(competitorId, { status: 'running', startedAt: startedAt.toISOString(), totalParams: params.length, doneParams: prev.doneParams + 1, found, notFound, errors })
  }

  await prisma.$transaction([
    prisma.compSetResult.deleteMany({ where: { propertyId, competitorId: competitor.id } }),
    prisma.compSetResult.createMany({ data: toInsert }),
  ])

  const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000)
  const doneStatus = { status: 'done' as const, startedAt: startedAt.toISOString(), totalParams: params.length, doneParams: params.length, durationSec, found, notFound, errors }
  setCompetitorRunStatus(competitorId, doneStatus)
  setRunStatus(propertyId, { ...doneStatus, runLabel: competitor.name })
  logger.info({ competitorId, rows: toInsert.length }, '[CompSet] Single-competitor run complete')
}

export async function runPropertyCompSet(propertyId: number): Promise<void> {
  logger.info({ propertyId }, '[CompSet] Starting collection run')

  // Set running immediately (before any await) so the status endpoint reflects it right away
  const startedAt = new Date()
  setRunStatus(propertyId, { status: 'running', startedAt: startedAt.toISOString(), totalParams: 0, doneParams: 0, found: 0, notFound: 0, errors: 0, runLabel: 'all' })

  const [params, competitors] = await Promise.all([
    getEffectiveSearchParams(propertyId),
    listCompetitors(propertyId),
  ])

  if (params.length === 0) {
    logger.info({ propertyId }, '[CompSet] No search params — skipping')
    setRunStatus(propertyId, { status: 'done', startedAt: startedAt.toISOString(), totalParams: 0, doneParams: 0, durationSec: 0, found: 0, notFound: 0, errors: 0 })
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

  // Update totalParams now that we know how many params there are
  setRunStatus(propertyId, { status: 'running', startedAt: startedAt.toISOString(), totalParams: params.length, doneParams: 0, found: 0, notFound: 0, errors: 0, runLabel: 'all' })

  const fetchedAt = startedAt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert: any[] = []
  let found = 0, notFound = 0, errors = 0

  for (const param of params) {
    const checkIn = resolveDate(param.offsetDays)
    const checkOut = resolveDate(param.offsetDays + param.nights)

    try {
      const ownRates = await fetchOwnRates(propertyId, param)
      for (const rate of ownRates) {
        toInsert.push({
          propertyId, competitorId: null, searchParamId: param.id,
          fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
          countryCode: '', searchStatus: 'found',
          roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
          pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
        })
      }
      if (ownRates.length === 0) {
        notFound++
        toInsert.push({
          propertyId, competitorId: null, searchParamId: param.id,
          fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
          countryCode: '', searchStatus: 'not_found',
          roomName: null, board: null, cancellation: null,
          pricePerNight: null, total: null, currency: null,
        })
      } else {
        found += ownRates.length
      }
    } catch (err) {
      errors++
      logger.warn({ err, propertyId, paramId: param.id }, '[CompSet] Own rates fetch failed')
      toInsert.push({
        propertyId, competitorId: null, searchParamId: param.id,
        fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
        countryCode: '', searchStatus: 'error',
        roomName: null, board: null, cancellation: null,
        pricePerNight: null, total: null, currency: null,
      })
    }

    for (const competitor of competitors) {
      if (!competitor.searchUrl) {
        errors++
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'error', errorMsg: 'No search URL configured', lastFetchAt: fetchedAt },
        })
        continue
      }

      const guests = [
        ...Array(param.adults).fill('A'),
        ...param.childAges.map(String),
      ].join(',')
      const expandedTemplate = expandCompetitorUrl(competitor.searchUrl)
      const builtUrl = buildExternalUrl(expandedTemplate, {
        checkIn, checkOut, adults: param.adults,
        nights: param.nights, countryCode: '',
        currency: 'USD', guests,
      })
      logger.info({ raw: competitor.searchUrl, expanded: expandedTemplate, builtUrl }, '[CompSet] Built competitor URL')

      try {
        const rates = await fetchCompetitorRates(builtUrl, orgId)
        for (const rate of rates) {
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: '', searchStatus: 'found',
            roomName: rate.roomName, board: rate.board, cancellation: rate.cancellation,
            pricePerNight: rate.pricePerNight, total: rate.total, currency: rate.currency,
          })
        }
        if (rates.length === 0) {
          notFound++
          toInsert.push({
            propertyId, competitorId: competitor.id, searchParamId: param.id,
            fetchedAt, checkIn, checkOut, nights: param.nights, adults: param.adults,
            countryCode: '', searchStatus: 'not_found',
            roomName: null, board: null, cancellation: null,
            pricePerNight: null, total: null, currency: null,
          })
        } else {
          found += rates.length
        }
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'done', lastFetchAt: fetchedAt, errorMsg: null },
        })
      } catch (err) {
        errors++
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.compSetCompetitor.update({
          where: { id: competitor.id },
          data: { status: 'error', lastFetchAt: fetchedAt, errorMsg: msg },
        })
      }
    }

    // Update progress after each param completes
    const prev = getRunStatus(propertyId)
    setRunStatus(propertyId, { ...prev, doneParams: (prev.doneParams ?? 0) + 1, found, notFound, errors })
  }

  await prisma.$transaction([
    prisma.compSetResult.deleteMany({ where: { propertyId } }),
    prisma.compSetResult.createMany({ data: toInsert }),
  ])

  const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000)
  setRunStatus(propertyId, { status: 'done', startedAt: startedAt.toISOString(), totalParams: params.length, doneParams: params.length, durationSec, found, notFound, errors, runLabel: 'all' })

  logger.info({ propertyId, rows: toInsert.length, durationSec }, '[CompSet] Collection run complete')

  // Trigger event calendar refresh for the same date window (non-fatal, only when enabled)
  const dates = params.map(p => ({
    start: resolveDate(p.offsetDays),
    end: resolveDate(p.offsetDays + p.nights),
  }))
  const minStart = dates.reduce((min, d) => d.start < min ? d.start : min, dates[0]!.start)
  const maxEnd = dates.reduce((max, d) => d.end > max ? d.end : max, dates[0]!.end)
  await getSystemEventCalendarConfig().then(cfg => {
    if (!cfg.enabled) return
    return refreshPropertyEvents(propertyId, minStart, maxEnd)
  }).catch(err =>
    logger.warn({ err, propertyId }, '[EventCalendar] Post-CompSet event refresh failed (non-fatal)'),
  )
}
