import type { FastifyInstance } from 'fastify'
import {
  getSystemInterHotelConfig, upsertSystemInterHotelConfig,
  getOrgInterHotelConfig, upsertOrgInterHotelConfig,
  getPropertyInterHotelConfig, upsertPropertyInterHotelConfig,
  resolveEffectiveInterHotelConfig,
} from '../services/interhotel-config.service.js'
import { refreshNearbyHotels, getNearbyHotelsAdmin, getNearbyHotelsForPropertyAdmin, setNearbyHotelSelection } from '../services/interhotel-nearby.service.js'
import { searchInterHotel } from '../services/interhotel-search.service.js'
import type {
  InterHotelEffective,
  OrgInterHotelConfigResponse,
  PropertyInterHotelConfigResponse,
} from '@ibe/shared'

export async function interHotelPublicRoutes(fastify: FastifyInstance) {
  // ── Effective config (no auth) ─────────────────────────────────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/interhotel/config/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return resolveEffectiveInterHotelConfig(propertyId)
    },
  )

  // ── InterHotel search (no auth) ────────────────────────────────────────────
  fastify.post<{
    Body: { propertyId: number; checkIn: string; checkOut: string; rooms: { adults: number }[]; nationality?: string; currency?: string }
  }>(
    '/api/v1/interhotel/search',
    async (request, reply) => {
      const { propertyId, checkIn, checkOut, rooms, nationality, currency } = request.body ?? {}
      if (!propertyId || typeof propertyId !== 'number') {
        return reply.status(400).send({ error: 'propertyId is required' })
      }
      return searchInterHotel({
        propertyId,
        checkIn,
        checkOut,
        rooms: rooms ?? [],
        ...(nationality !== undefined && { nationality }),
        ...(currency !== undefined && { currency }),
      })
    },
  )
}

export async function interHotelAdminRoutes(fastify: FastifyInstance) {
  // ── System config ─────────────────────────────────────────────────────────
  fastify.get('/api/v1/admin/interhotel/config/system', async () => {
    return getSystemInterHotelConfig()
  })

  fastify.put('/api/v1/admin/interhotel/config/system', async (request) => {
    return upsertSystemInterHotelConfig(request.body as Partial<InterHotelEffective>)
  })

  // ── Org config ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return getOrgInterHotelConfig(orgId)
    },
  )

  fastify.put<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/config/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return upsertOrgInterHotelConfig(orgId, request.body as Partial<OrgInterHotelConfigResponse>)
    },
  )

  // ── Property config ───────────────────────────────────────────────────────
  fastify.get<{ Params: { propertyId: string } }>(
    '/api/v1/admin/interhotel/config/property/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return getPropertyInterHotelConfig(propertyId)
    },
  )

  fastify.put<{ Params: { propertyId: string } }>(
    '/api/v1/admin/interhotel/config/property/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      return upsertPropertyInterHotelConfig(propertyId, request.body as Partial<PropertyInterHotelConfigResponse>)
    },
  )

  // ── Refresh nearby hotels ─────────────────────────────────────────────────
  fastify.post<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/refresh/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return refreshNearbyHotels(orgId)
    },
  )

  // ── List nearby hotels (admin display) ───────────────────────────────────
  fastify.get<{ Params: { orgId: string } }>(
    '/api/v1/admin/interhotel/nearby/org/:orgId',
    async (request, reply) => {
      const orgId = parseInt(request.params.orgId, 10)
      if (isNaN(orgId)) return reply.status(400).send({ error: 'Invalid orgId' })
      return getNearbyHotelsAdmin(orgId)
    },
  )

  fastify.get<{ Params: { propertyId: string }; Querystring: { skip?: string; take?: string } }>(
    '/api/v1/admin/interhotel/nearby/property/:propertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      if (isNaN(propertyId)) return reply.status(400).send({ error: 'Invalid propertyId' })
      const skip = parseInt(request.query.skip ?? '0', 10) || 0
      const take = parseInt(request.query.take ?? '10', 10) || 10
      return getNearbyHotelsForPropertyAdmin(propertyId, skip, take)
    },
  )

  // ── Set manual selection override ─────────────────────────────────────────
  fastify.put<{ Params: { propertyId: string; nearbyPropertyId: string }; Body: { selected: boolean | null } }>(
    '/api/v1/admin/interhotel/nearby/property/:propertyId/:nearbyPropertyId',
    async (request, reply) => {
      const propertyId = parseInt(request.params.propertyId, 10)
      const nearbyPropertyId = parseInt(request.params.nearbyPropertyId, 10)
      if (isNaN(propertyId) || isNaN(nearbyPropertyId)) return reply.status(400).send({ error: 'Invalid ids' })
      const selected = request.body?.selected ?? null
      await setNearbyHotelSelection(propertyId, nearbyPropertyId, selected)
      return { ok: true }
    },
  )
}
