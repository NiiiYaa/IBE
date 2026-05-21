// apps/api/src/routes/external-ibe.route.ts
import type { FastifyInstance } from 'fastify'
import {
  getExternalIBEConfig,
  upsertExternalIBEConfig,
  deleteExternalIBEConfig,
  analyzeExternalIBEUrls,
  getEffectiveExternalIBEConfig,
  buildExternalUrl,
  bulkMapExternalHotelIds,
} from '../services/external-ibe.service.js'
import { resolveExternalBookingUrl } from '../services/external-ibe-scraper.service.js'
import type { ExternalIBEConfigUpdate, ExternalIBEAnalyzeRequest, ExternalIBETestResultItem, ExternalIBEBulkMapRequest, IBERegistryEntry } from '@ibe/shared'
import { lookupIBERegistry, upsertIBERegistry } from '../services/ibe-registry.service.js'

function parseScope(
  query: Record<string, string>,
  admin: { role: string; organizationId: number | null },
): { orgId?: number; propertyId?: number } | { error: string } {
  const rawProperty = query['propertyId']
  const rawOrg = query['orgId']

  if (rawProperty) {
    const propertyId = parseInt(rawProperty, 10)
    if (isNaN(propertyId)) return { error: 'Invalid propertyId' }
    return { propertyId }
  }

  if (rawOrg) {
    const orgId = parseInt(rawOrg, 10)
    if (isNaN(orgId)) return { error: 'Invalid orgId' }
    if (admin.role !== 'super' && admin.organizationId !== orgId) return { error: 'Forbidden' }
    return { orgId }
  }

  if (admin.organizationId) return { orgId: admin.organizationId }
  return { error: 'No scope provided' }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
}

function padDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function probeUrl(url: string): Promise<{ httpStatus: number | null; httpOk: boolean }> {
  if (url.includes('{')) return { httpStatus: null, httpOk: false }
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(6000), redirect: 'follow' })
    return { httpStatus: res.status, httpOk: res.status >= 200 && res.status < 400 }
  } catch {
    return { httpStatus: null, httpOk: false }
  }
}

interface RunCaseOpts {
  label: string
  checkIn: string
  checkOut: string
  adults: number
  childrenAges: number[]
  propertyId: number
}

async function runCase(opts: RunCaseOpts): Promise<ExternalIBETestResultItem> {
  const { label, checkIn, checkOut, adults, childrenAges, propertyId } = opts
  const start = Date.now()
  const nights = nightsBetween(checkIn, checkOut)
  const children = childrenAges.length
  const guests = [...Array(adults).fill('A'), ...childrenAges.map(String)].join(',') || undefined

  try {
    const config = await getEffectiveExternalIBEConfig(propertyId)
    if (!config?.bookingTemplate) {
      return {
        label, checkIn, checkOut, nights, adults, childrenAges,
        searchUrl: null, bookingUrl: null, fallback: false,
        httpStatus: null, httpOk: false,
        error: 'No booking template configured',
        durationMs: Date.now() - start,
      }
    }

    const needsScraping = config.bookingTemplate.includes('{solutionId}') && !!config.searchTemplate

    if (needsScraping) {
      const searchUrl = buildExternalUrl(config.searchTemplate!, {
        externalHotelId: config.externalHotelId,
        checkIn, checkOut, adults, children, guests, rooms: 1,
        currency: null, nationality: null,
      })
      const resolved = await resolveExternalBookingUrl({
        searchUrl,
        bookingTemplate: config.bookingTemplate!,
        externalHotelId: config.externalHotelId,
        checkIn, checkOut, adults, children, childrenAges,
      })
      const { httpStatus, httpOk } = await probeUrl(resolved.bookingUrl)
      return {
        label, checkIn, checkOut, nights, adults, childrenAges,
        searchUrl,
        bookingUrl: resolved.bookingUrl,
        fallback: resolved.fallback,
        httpStatus, httpOk,
        durationMs: Date.now() - start,
      }
    } else {
      const searchUrl = config.searchTemplate
        ? buildExternalUrl(config.searchTemplate, {
            externalHotelId: config.externalHotelId,
            checkIn, checkOut, adults, children, guests, rooms: 1,
            currency: null, nationality: null,
          })
        : null
      const bookingUrl = buildExternalUrl(config.bookingTemplate!, {
        externalHotelId: config.externalHotelId,
        checkIn, checkOut, adults, children, guests, rooms: 1,
        currency: null, nationality: null,
      })
      const { httpStatus, httpOk } = await probeUrl(bookingUrl)
      return {
        label, checkIn, checkOut, nights, adults, childrenAges,
        searchUrl,
        bookingUrl,
        fallback: false,
        httpStatus, httpOk,
        durationMs: Date.now() - start,
      }
    }
  } catch (err) {
    return {
      label, checkIn, checkOut, nights, adults, childrenAges,
      searchUrl: null, bookingUrl: null, fallback: false,
      httpStatus: null, httpOk: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      durationMs: Date.now() - start,
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function externalIBERoutes(fastify: FastifyInstance) {
  fastify.get('/admin/external-ibe', async (request, reply) => {
    const scope = parseScope(
      request.query as Record<string, string>,
      request.admin,
    )
    if ('error' in scope) return reply.status(400).send({ error: scope.error })
    return reply.send(await getExternalIBEConfig(scope))
  })

  fastify.put('/admin/external-ibe', async (request, reply) => {
    const scope = parseScope(
      request.query as Record<string, string>,
      request.admin,
    )
    if ('error' in scope) return reply.status(400).send({ error: scope.error })
    const body = request.body as ExternalIBEConfigUpdate
    return reply.send(await upsertExternalIBEConfig(scope, body))
  })

  fastify.delete('/admin/external-ibe', async (request, reply) => {
    const scope = parseScope(
      request.query as Record<string, string>,
      request.admin,
    )
    if ('error' in scope) return reply.status(400).send({ error: scope.error })
    try {
      await deleteExternalIBEConfig(scope)
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Config not found' })
    }
  })

  fastify.post('/admin/external-ibe/bulk-map', async (request, reply) => {
    const { orgId, mappings } = request.body as ExternalIBEBulkMapRequest

    if (!orgId || !Array.isArray(mappings)) {
      return reply.status(400).send({ error: 'orgId and mappings are required' })
    }

    const admin = request.admin
    if (admin.role !== 'super' && admin.organizationId !== orgId) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    return reply.send(await bulkMapExternalHotelIds(orgId, mappings))
  })

  // ── POST /admin/external-ibe/test ─────────────────────────────────────────
  fastify.post('/admin/external-ibe/test', async (request, reply) => {
    const scope = parseScope(request.query as Record<string, string>, request.admin)
    if ('error' in scope) return reply.status(400).send({ error: scope.error })

    const propertyId = 'propertyId' in scope ? scope.propertyId! : null
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required for testing' })

    const body = request.body as {
      checkIn?: string
      checkOut?: string
      adults?: number
      childrenAges?: number[]
    }
    const now = new Date()
    const checkIn      = body.checkIn      ?? padDate(new Date(now.getTime() + 30 * 86400000))
    const checkOut     = body.checkOut     ?? padDate(new Date(now.getTime() + 32 * 86400000))
    const adults       = body.adults       ?? 2
    const childrenAges = body.childrenAges ?? []

    const guestLabel = [
      `${adults} adult${adults !== 1 ? 's' : ''}`,
      ...childrenAges.map((age, i) => i === 0 && childrenAges.length === 1 ? `child (${age})` : `child ${i + 1} (${age})`),
    ].join(' + ')

    const result = await runCase({ label: guestLabel, checkIn, checkOut, adults, childrenAges, propertyId })
    return reply.send({ checkIn, checkOut, results: [result] })
  })

  // ── POST /admin/external-ibe/test/combinations (SSE) ─────────────────────
  fastify.post('/admin/external-ibe/test/combinations', async (request, reply) => {
    const scope = parseScope(request.query as Record<string, string>, request.admin)
    if ('error' in scope) return reply.status(400).send({ error: scope.error })

    const propertyId = 'propertyId' in scope ? scope.propertyId! : null
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required for testing' })

    const now = new Date()

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    function fmtLabel(iso: string): string {
      const [y, m, d] = iso.split('-')
      return `${d}-${MONTHS[parseInt(m!) - 1]}-${y}`
    }

    interface TestCase {
      label: string
      checkIn: string
      checkOut: string
      adults: number
      childrenAges: number[]
    }

    const combos = [
      { offsetDays: 7,  nights: 2, adults: 2, childrenAges: [] as number[] },
      { offsetDays: 7,  nights: 2, adults: 2, childrenAges: [10] },
      { offsetDays: 15, nights: 3, adults: 1, childrenAges: [] as number[] },
      { offsetDays: 15, nights: 3, adults: 2, childrenAges: [10] },
      { offsetDays: 33, nights: 4, adults: 1, childrenAges: [] as number[] },
      { offsetDays: 33, nights: 4, adults: 2, childrenAges: [] as number[] },
    ]

    const cases: TestCase[] = combos.map(c => {
      const ci = padDate(new Date(now.getTime() + c.offsetDays * 86400000))
      const co = padDate(new Date(now.getTime() + (c.offsetDays + c.nights) * 86400000))
      const guestLabel = c.childrenAges.length > 0 ? `${c.adults}A+${c.childrenAges.length}C` : `${c.adults}A`
      return { label: `${fmtLabel(ci)} (${c.nights}n) · ${guestLabel}`, checkIn: ci, checkOut: co, adults: c.adults, childrenAges: c.childrenAges }
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    function send(data: unknown): void {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    // Run all cases sequentially (one Playwright browser at a time)
    for (const tc of cases) {
      const TIMEOUT_MS = 25000

      let item: ExternalIBETestResultItem
      try {
        item = await Promise.race([
          runCase({ label: tc.label, checkIn: tc.checkIn, checkOut: tc.checkOut, adults: tc.adults, childrenAges: tc.childrenAges, propertyId }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
          ),
        ])
      } catch (err) {
        const nights = nightsBetween(tc.checkIn, tc.checkOut)
        item = {
          label: tc.label,
          checkIn: tc.checkIn,
          checkOut: tc.checkOut,
          nights,
          adults: tc.adults,
          childrenAges: tc.childrenAges,
          searchUrl: null,
          bookingUrl: null,
          fallback: false,
          httpStatus: null,
          httpOk: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          durationMs: TIMEOUT_MS,
        }
      }

      send({ type: 'result', item })
    }

    send({ type: 'done' })
    reply.raw.end()
    return reply
  })

  fastify.post('/admin/external-ibe/analyze', async (request, reply) => {
    const body = request.body as ExternalIBEAnalyzeRequest
    if (!body.urls?.length) return reply.status(400).send({ error: 'urls is required' })
    if (!body.type) return reply.status(400).send({ error: 'type is required' })
    const result = await analyzeExternalIBEUrls(body)
    if ('error' in result) return reply.status(422).send(result)
    return reply.send(result)
  })

  // IBE Registry — shared across External IBE and CompSet
  fastify.get('/admin/external-ibe/registry/lookup', async (request, reply) => {
    const { hostname } = request.query as Record<string, string>
    if (!hostname) return reply.status(400).send({ error: 'hostname is required' })
    const entry = await lookupIBERegistry(hostname)
    return reply.send(entry ?? null)
  })

  fastify.post('/admin/external-ibe/registry', async (request, reply) => {
    const body = request.body as IBERegistryEntry
    if (!body.hostname) return reply.status(400).send({ error: 'hostname is required' })
    return reply.send(await upsertIBERegistry(body))
  })
}
