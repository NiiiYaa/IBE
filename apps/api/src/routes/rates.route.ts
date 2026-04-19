import type { FastifyInstance } from 'fastify'
import { getExchangeRates } from '../services/rates.service.js'

export async function ratesRoutes(fastify: FastifyInstance) {
  fastify.get('/rates', async (request, reply) => {
    const { base = 'USD' } = request.query as { base?: string }
    const data = await getExchangeRates(base.toUpperCase())
    return reply.send(data)
  })
}
