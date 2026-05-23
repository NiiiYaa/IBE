import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import {
  getSystemPricingConfig, upsertSystemPricingConfig,
  getOrgPricingConfig, upsertOrgPricingConfig,
  getPropertyPricingConfig, upsertPropertyPricingConfig,
  resolveEffectivePricingConfig,
} from '../services/pricing-config.service.js'
import { enqueuePricingJob, getPricingJobStatus } from '../services/pricing-queue.service.js'
import { collectHotelPrices } from '../services/pricing-collect.service.js'
import { classifyDailyRates } from '../services/pricing-classify.service.js'
import { logger } from '../utils/logger.js'
import { getExchangeRates } from '../services/rates.service.js'
import type { RateProvider } from '../services/rates.service.js'
import { getHotelDesignConfig } from '../services/config.service.js'
import { cacheGet, cacheSet } from '../utils/cache.js'
import type { DayPriceEntry, DayRateAdminEntry, DayOfferAdminEntry, PricingJobStatus, PricingCollectionProgress } from '@ibe/shared'

const _runningDirect = new Set<number>()
interface RunProgress { startedAt: number; windowsDone: number; totalWindows: number; offerCount: number }
const _progress = new Map<number, RunProgress>()

const CALENDAR_TTL = 3600

export async function pricingPublicRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { propertyId: string }; Querystring: { currency?: string } }>(
    '/api/v1/pricing/calendar/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })

      const currency = request.query.currency
      const cacheKey = `pricing:calendar:${propertyId}:${currency ?? 'native'}`
      const cached = await cacheGet<DayPriceEntry[]>(cacheKey)
      if (cached) return cached

      const designConfig = await getHotelDesignConfig(propertyId)
      if (!designConfig.pricingEnabled) return reply.send([])

      const rateProvider = (designConfig.rateProvider ?? 'fawazahmed0') as RateProvider

      const rates = await prisma.dailyRate.findMany({
        where: { propertyId },
        orderBy: { date: 'asc' },
        select: { date: true, minSellPrice: true, currency: true, available: true, calendarColor: true },
      })
      if (rates.length === 0) return reply.send([])

      // Use the most common currency to avoid stale rows with a different currency skewing detection
      const currencyCounts = rates.reduce((acc, r) => { acc[r.currency] = (acc[r.currency] ?? 0) + 1; return acc }, {} as Record<string, number>)
      const nativeCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]![0]
      const nativeRates = rates.filter(r => r.currency === nativeCurrency)
      let fxRate: number | null = null
      if (currency && currency !== nativeCurrency) {
        try {
          const fx = await getExchangeRates(nativeCurrency, rateProvider)
          fxRate = fx.rates[currency] ?? null
        } catch { /* fxRate stays null — will fall back to native */ }
      }

      const conversionOk = !currency || currency === nativeCurrency || fxRate !== null
      const effectiveCurrency = conversionOk ? (currency ?? nativeCurrency) : nativeCurrency
      const rate = fxRate ?? 1

      if (!conversionOk) {
        logger.warn({ propertyId, requestedCurrency: currency, nativeCurrency }, '[Pricing] FX conversion failed — returning native currency')
      }

      const result: DayPriceEntry[] = nativeRates.map(r => ({
        date: r.date,
        price: Math.round(r.minSellPrice * rate * 100) / 100,
        currency: effectiveCurrency,
        available: r.available,
        calendarColor: r.calendarColor as 'low' | 'normal' | 'high',
      }))

      // Don't cache if FX conversion failed — retry on next request
      if (conversionOk) await cacheSet(cacheKey, result, CALENDAR_TTL)
      return result
    },
  )
}

export async function pricingAdminRoutes(fastify: FastifyInstance) {
  // ── System config ─────────────────────────────────────────────────────────
  fastify.get('/api/v1/admin/pricing/config/system', async () => {
    return getSystemPricingConfig()
  })

  fastify.put('/api/v1/admin/pricing/config/system', async (request) => {
    return upsertSystemPricingConfig(request.body as Parameters<typeof upsertSystemPricingConfig>[0])
  })

  // ── Org config ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/pricing/config/org/:orgId',
    async (request) => {
      return getOrgPricingConfig(parseInt(request.params.orgId, 10))
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/pricing/config/org/:orgId',
    async (request) => {
      return upsertOrgPricingConfig(parseInt(request.params.orgId, 10), request.body as Parameters<typeof upsertOrgPricingConfig>[1])
    },
  )

  // ── Property config ───────────────────────────────────────────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/config/property/:propertyId',
    async (request) => {
      return getPropertyPricingConfig(parseInt(request.params.propertyId, 10))
    },
  )

  fastify.put<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/config/property/:propertyId',
    async (request) => {
      return upsertPropertyPricingConfig(parseInt(request.params.propertyId, 10), request.body as Parameters<typeof upsertPropertyPricingConfig>[1])
    },
  )

  // ── Operations ────────────────────────────────────────────────────────────
  fastify.post<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/refresh/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (_runningDirect.has(propertyId)) return reply.send({ status: 'already_running' })

      // Try BullMQ first; fall back to direct background run if Redis is unavailable
      try {
        const bullStatus = await Promise.race([
          enqueuePricingJob(propertyId, 'manual'),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ])
        if (bullStatus === 'already_running') return reply.send({ status: 'already_running' })
        // BullMQ accepted the job — also run directly so it works without a worker
      } catch {
        logger.warn({ propertyId }, '[Pricing] BullMQ unavailable — running collection directly')
      }

      _runningDirect.add(propertyId)
      _progress.set(propertyId, { startedAt: Date.now(), windowsDone: 0, totalWindows: 0, offerCount: 0 })
      void (async () => {
        try {
          await collectHotelPrices(propertyId, (windowsDone, totalWindows, offerCount) => {
            _progress.set(propertyId, { startedAt: _progress.get(propertyId)!.startedAt, windowsDone, totalWindows, offerCount })
          })
          await classifyDailyRates(propertyId)
        } catch (err) {
          logger.warn({ err, propertyId }, '[Pricing] Direct collection failed')
        } finally {
          _runningDirect.delete(propertyId)
          _progress.delete(propertyId)
        }
      })()

      return reply.send({ status: 'queued' })
    },
  )

  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/status/:propertyId',
    async (request) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const [jobStatus, lastRate, dayCount] = await Promise.all([
        _runningDirect.has(propertyId) ? Promise.resolve<'running'>('running') : getPricingJobStatus(propertyId),
        prisma.dailyRate.findFirst({
          where: { propertyId },
          orderBy: { collectedAt: 'desc' },
          select: { collectedAt: true },
        }),
        prisma.dailyRate.count({ where: { propertyId } }),
      ])
      const prog = _progress.get(propertyId)
      const progress: PricingCollectionProgress | undefined = prog
        ? { windowsDone: prog.windowsDone, totalWindows: prog.totalWindows, offerCount: prog.offerCount, elapsedSeconds: Math.round((Date.now() - prog.startedAt) / 1000) }
        : undefined
      const result: PricingJobStatus = {
        status: jobStatus,
        lastCollectedAt: lastRate?.collectedAt.toISOString() ?? null,
        dayCount,
        ...(progress !== undefined && { progress }),
      }
      return result
    },
  )

  // ── Admin data (full daily rates with anomalyType for dashboard/export) ──
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/data/:propertyId',
    async (request) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const rates = await prisma.dailyRate.findMany({
        where: { propertyId },
        orderBy: { date: 'asc' },
        select: {
          date: true, minSellPrice: true, currency: true, available: true,
          calendarColor: true, anomalyType: true, rollingAvg: true,
          cheapestRoomName: true, cheapestBoard: true, cheapestCancellationLabel: true,
        },
      })
      // Filter to most common currency to exclude stale rows from previous collection runs
      const currencyCounts = rates.reduce((acc, r) => { acc[r.currency] = (acc[r.currency] ?? 0) + 1; return acc }, {} as Record<string, number>)
      const nativeCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      const filtered = nativeCurrency ? rates.filter(r => r.currency === nativeCurrency) : rates
      const result: DayRateAdminEntry[] = filtered.map(r => ({
        date: r.date,
        price: r.minSellPrice,
        currency: r.currency,
        available: r.available,
        calendarColor: r.calendarColor as 'low' | 'normal' | 'high',
        anomalyType: r.anomalyType as 'high' | 'low' | 'diff' | null,
        rollingAvg: r.rollingAvg,
        cheapestRoomName: r.cheapestRoomName ?? null,
        cheapestBoard: r.cheapestBoard ?? null,
        cheapestCancellationLabel: r.cheapestCancellationLabel ?? null,
      }))
      return result
    },
  )

  // ── All offers per date (raw offer-level data for export) ─────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/offers/:propertyId',
    async (request) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const offers = await prisma.dailyRateOffer.findMany({
        where: { propertyId },
        orderBy: [{ date: 'asc' }, { rank: 'asc' }],
        select: { date: true, rank: true, roomName: true, board: true, cancellationLabel: true, sellPrice: true, currency: true },
      })
      // Filter to most common currency to exclude stale rows
      const currencyCounts = offers.reduce((acc, r) => { acc[r.currency] = (acc[r.currency] ?? 0) + 1; return acc }, {} as Record<string, number>)
      const nativeCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      const filtered = nativeCurrency ? offers.filter(r => r.currency === nativeCurrency) : offers
      const result: DayOfferAdminEntry[] = filtered.map(r => ({
        date: r.date,
        rank: r.rank,
        roomName: r.roomName,
        board: r.board,
        cancellationLabel: r.cancellationLabel,
        sellPrice: r.sellPrice,
        currency: r.currency,
      }))
      return result
    },
  )
}
