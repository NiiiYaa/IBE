import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import {
  getSystemPricingConfig, upsertSystemPricingConfig,
  getOrgPricingConfig, upsertOrgPricingConfig,
  getPropertyPricingConfig, upsertPropertyPricingConfig,
  resolveEffectivePricingConfig,
} from '../services/pricing-config.service.js'
import { enqueuePricingJob, getPricingJobStatus } from '../services/pricing-queue.service.js'
import { getExchangeRates } from '../services/rates.service.js'
import { cacheGet, cacheSet } from '../utils/cache.js'
import type { DayPriceEntry, DayRateAdminEntry, PricingJobStatus } from '@ibe/shared'

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

      const config = await resolveEffectivePricingConfig(propertyId)
      if (!config.enabled) return reply.send([])

      const rates = await prisma.dailyRate.findMany({
        where: { propertyId },
        orderBy: { date: 'asc' },
        select: { date: true, minSellPrice: true, currency: true, available: true, calendarColor: true },
      })
      if (rates.length === 0) return reply.send([])

      const nativeCurrency = rates[0]!.currency
      let fxRate = 1
      if (currency && currency !== nativeCurrency) {
        try {
          const fx = await getExchangeRates(nativeCurrency)
          fxRate = fx.rates[currency] ?? 1
        } catch { /* skip conversion */ }
      }

      const result: DayPriceEntry[] = rates.map(r => ({
        date: r.date,
        price: Math.round(r.minSellPrice * fxRate * 100) / 100,
        currency: currency ?? nativeCurrency,
        available: r.available,
        calendarColor: r.calendarColor as 'low' | 'normal' | 'high',
      }))

      await cacheSet(cacheKey, result, CALENDAR_TTL)
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
      const status = await enqueuePricingJob(propertyId, 'manual')
      return reply.send({ status })
    },
  )

  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/pricing/status/:propertyId',
    async (request) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const [jobStatus, lastRate, dayCount] = await Promise.all([
        getPricingJobStatus(propertyId),
        prisma.dailyRate.findFirst({
          where: { propertyId },
          orderBy: { collectedAt: 'desc' },
          select: { collectedAt: true },
        }),
        prisma.dailyRate.count({ where: { propertyId } }),
      ])
      const result: PricingJobStatus = {
        status: jobStatus,
        lastCollectedAt: lastRate?.collectedAt.toISOString() ?? null,
        dayCount,
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
        select: { date: true, minSellPrice: true, currency: true, available: true, calendarColor: true, anomalyType: true, rollingAvg: true },
      })
      const result: DayRateAdminEntry[] = rates.map(r => ({
        date: r.date,
        price: r.minSellPrice,
        currency: r.currency,
        available: r.available,
        calendarColor: r.calendarColor as 'low' | 'normal' | 'high',
        anomalyType: r.anomalyType as 'high' | 'low' | 'diff' | null,
        rollingAvg: r.rollingAvg,
      }))
      return result
    },
  )
}
