import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../services/external-ibe.service.js', () => ({
  getEffectiveExternalIBEConfig: vi.fn(),
  buildExternalUrl: vi.fn((template: string) => `https://ext.com/search?hotel=4521&from=2024-06-01`),
}))

vi.mock('../../services/external-ibe-scraper.service.js', () => ({
  resolveExternalBookingUrl: vi.fn(),
}))

import { getEffectiveExternalIBEConfig } from '../../services/external-ibe.service.js'
import { resolveExternalBookingUrl } from '../../services/external-ibe-scraper.service.js'
import { externalIBEResolveRoutes } from '../../routes/external-ibe-resolve.route.js'

const mockGetConfig = getEffectiveExternalIBEConfig as ReturnType<typeof vi.fn>
const mockResolve = resolveExternalBookingUrl as ReturnType<typeof vi.fn>

const FULL_CONFIG = {
  searchTemplate: 'https://ext.com/search?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
  bookingTemplate: 'https://ext.com/solution/{solutionId}/guest?hotel={externalHotelId}&from={checkIn}',
  externalHotelId: '4521',
  mcpEnabled: true,
  affiliateEnabled: false,
  widgetEnabled: true,
}

async function buildApp() {
  const app = Fastify()
  await app.register(externalIBEResolveRoutes, { prefix: '/api/v1' })
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/v1/public/external-ibe/resolve', () => {
  it('returns 400 when propertyId is missing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { checkIn: '2024-06-01', checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('required') })
  })

  it('returns 400 when propertyId is zero', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: 0, checkIn: '2024-06-01', checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('required') })
  })

  it('returns 400 when propertyId is negative', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: -1, checkIn: '2024-06-01', checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('required') })
  })

  it('returns 400 when checkIn is missing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: 42, checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('required') })
  })

  it('returns 404 when property has no external IBE config', async () => {
    mockGetConfig.mockResolvedValue(null)
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: 42, checkIn: '2024-06-01', checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('not configured') })
  })

  it('returns 404 when widgetEnabled is false', async () => {
    mockGetConfig.mockResolvedValue({ ...FULL_CONFIG, widgetEnabled: false })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: 42, checkIn: '2024-06-01', checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('not configured') })
  })

  it('returns 200 with resolved booking URL', async () => {
    mockGetConfig.mockResolvedValue(FULL_CONFIG)
    mockResolve.mockResolvedValue({
      bookingUrl: 'https://ext.com/solution/uuid-aaa/guest?hotel=4521&from=2024-06-01',
      fallback: false,
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: 42, checkIn: '2024-06-01', checkOut: '2024-06-07', adults: 2 },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.bookingUrl).toContain('/solution/uuid-aaa/guest')
    expect(body.fallback).toBe(false)
  })

  it('returns 200 with fallback=true when scrape fails', async () => {
    mockGetConfig.mockResolvedValue(FULL_CONFIG)
    mockResolve.mockResolvedValue({
      bookingUrl: 'https://ext.com/search?hotel=4521&from=2024-06-01',
      fallback: true,
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/external-ibe/resolve',
      payload: { propertyId: 42, checkIn: '2024-06-01', checkOut: '2024-06-07' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.fallback).toBe(true)
    expect(body.bookingUrl).toContain('search')
  })
})
