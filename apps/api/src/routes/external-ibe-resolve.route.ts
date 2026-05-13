import type { FastifyInstance } from 'fastify'
import { getEffectiveExternalIBEConfig, buildExternalUrl } from '../services/external-ibe.service.js'
import { resolveExternalBookingUrl } from '../services/external-ibe-scraper.service.js'
import type { ExternalIBEResolveRequest, ExternalIBEResolveResponse } from '@ibe/shared'

export async function externalIBEResolveRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: ExternalIBEResolveRequest }>('/public/external-ibe/resolve', async (request, reply) => {
    const { propertyId, checkIn, checkOut, adults = 2, roomName, lowestPrice } = request.body

    if (!propertyId || propertyId <= 0 || !checkIn || !checkOut) {
      return reply.status(400).send({ error: 'propertyId, checkIn, checkOut are required' })
    }

    const extConfig = await getEffectiveExternalIBEConfig(propertyId)
    if (!extConfig?.widgetEnabled || !extConfig.searchTemplate || !extConfig.bookingTemplate) {
      return reply.status(404).send({ error: 'External IBE not configured for this property' })
    }

    const searchUrl = buildExternalUrl(extConfig.searchTemplate, {
      externalHotelId: extConfig.externalHotelId,
      checkIn,
      checkOut,
      adults,
      rooms: 1,
    })

    const result = await resolveExternalBookingUrl({
      searchUrl,
      bookingTemplate: extConfig.bookingTemplate,
      externalHotelId: extConfig.externalHotelId,
      checkIn,
      checkOut,
      adults,
      ...(roomName !== undefined && { roomName }),
      ...(lowestPrice !== undefined && { lowestPrice }),
    })

    const response: ExternalIBEResolveResponse = {
      bookingUrl: result.bookingUrl,
      fallback: result.fallback,
    }
    return reply.send(response)
  })
}
