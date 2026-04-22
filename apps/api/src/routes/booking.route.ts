import type { FastifyInstance } from 'fastify'
import { CreateBookingRequestSchema, IBE_ERROR_VALIDATION } from '@ibe/shared'
import { book, BookingError } from '../services/booking.service.js'
import { logger } from '../utils/logger.js'
import { extractB2BContext } from '../utils/b2b-context.js'
import { getB2BAdminById } from '../services/b2b-auth.service.js'

export async function bookingRoutes(fastify: FastifyInstance) {
  fastify.post('/bookings', async (request, reply) => {
    const parseResult = CreateBookingRequestSchema.safeParse(request.body)

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: IBE_ERROR_VALIDATION,
        details: parseResult.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      })
    }

    // Resolve B2B attribution if this is a B2B request
    const b2bCtx = extractB2BContext(fastify, request)
    let b2bAttribution = undefined
    if (b2bCtx) {
      const admin = await getB2BAdminById(b2bCtx.adminId)
      b2bAttribution = {
        buyerOrgId: b2bCtx.buyerOrgId,
        buyerUserId: b2bCtx.adminId,
        buyerOrgName: admin?.organizationName ?? undefined,
        buyerUserName: admin?.name ?? undefined,
      }
    }

    try {
      const confirmation = await book(parseResult.data, b2bAttribution)
      return reply.status(201).send(confirmation)
    } catch (err) {
      if (err instanceof BookingError) {
        return reply.status(err.httpStatus).send({
          error: err.message || 'Booking failed',
          code: err.code,
        })
      }
      logger.error({ err }, '[BookingRoute] Unexpected error')
      throw err
    }
  })
}
