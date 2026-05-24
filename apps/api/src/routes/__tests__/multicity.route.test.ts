import { describe, it, expect, vi, beforeAll } from 'vitest'
import Fastify from 'fastify'
import { multiCityPublicRoutes, multiCityAdminRoutes } from '../multicity.route.js'

vi.mock('../../services/multicity-config.service.js', () => ({
  getSystemMultiCityConfig: vi.fn().mockResolvedValue({ enabled: false, maxLegs: 3 }),
  upsertSystemMultiCityConfig: vi.fn().mockImplementation(async (data) => ({ enabled: false, maxLegs: 3, ...data })),
  getOrgMultiCityConfig: vi.fn().mockResolvedValue({ enabled: null, maxLegs: null, effective: { enabled: false, maxLegs: 3 } }),
  upsertOrgMultiCityConfig: vi.fn().mockResolvedValue({ enabled: null, maxLegs: null, effective: { enabled: false, maxLegs: 3 } }),
  resolveEffectiveMultiCityConfig: vi.fn().mockResolvedValue({ enabled: false, maxLegs: 3 }),
}))

let app: ReturnType<typeof Fastify>

beforeAll(async () => {
  app = Fastify()
  await app.register(multiCityPublicRoutes)
  await app.register(multiCityAdminRoutes)
  await app.ready()
})

describe('GET /api/v1/multi-city/config/org/:orgId/effective', () => {
  it('returns effective config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/multi-city/config/org/1/effective' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body).toHaveProperty('enabled')
    expect(body).toHaveProperty('maxLegs')
  })

  it('returns 400 for invalid orgId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/multi-city/config/org/abc/effective' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/v1/admin/multi-city/config/system', () => {
  it('returns system config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/multi-city/config/system' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toHaveProperty('maxLegs')
  })
})
