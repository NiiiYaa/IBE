import type { FastifyInstance } from 'fastify'
import { CreatePaymentIntentRequestSchema, PaymentFlow, IBE_ERROR_VALIDATION } from '@ibe/shared'
import { createIntent } from '../services/payment/payment.service.js'
import { logger } from '../utils/logger.js'

export async function paymentRoutes(fastify: FastifyInstance) {
  /**
   * POST /payments/intent
   * Creates a Stripe PaymentIntent or SetupIntent depending on the payment flow.
   * The client_secret returned is passed directly to Stripe Elements on the frontend.
   */
  fastify.post('/payments/intent', async (request, reply) => {
    const parseResult = CreatePaymentIntentRequestSchema.safeParse(request.body)

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

    const { paymentFlow, amount, currency, propertyId } = parseResult.data

    // PayAtHotelNoCard requires no Stripe intent — caller should not reach this endpoint
    if (paymentFlow === PaymentFlow.PayAtHotelNoCard) {
      return reply.status(400).send({
        error: 'No Stripe intent needed for pay_at_hotel_no_card flow',
        code: IBE_ERROR_VALIDATION,
      })
    }

    try {
      const result = await createIntent(paymentFlow, { amount, currency, propertyId })
      return reply.send(result)
    } catch (err) {
      logger.error({ err }, '[PaymentRoute] Failed to create Stripe intent')
      throw err
    }
  })
}
