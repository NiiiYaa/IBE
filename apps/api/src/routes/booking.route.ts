import type { FastifyInstance } from 'fastify'
import { CreateBookingRequestSchema, IBE_ERROR_VALIDATION } from '@ibe/shared'
import { book, BookingError } from '../services/booking.service.js'
import { logger } from '../utils/logger.js'

export async function bookingRoutes(fastify: FastifyInstance) {
  // POST /bookings — create a new booking
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

    try {
      const confirmation = await book(parseResult.data)
      return reply.status(201).send(confirmation)
    } catch (err) {
      if (err instanceof BookingError) {
        return reply.status(err.httpStatus).send({
          error: err.message,
          code: err.code,
        })
      }
      logger.error({ err }, '[BookingRoute] Unexpected error')
      throw err
    }
  })
}
