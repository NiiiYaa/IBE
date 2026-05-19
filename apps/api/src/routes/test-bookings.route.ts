// apps/api/src/routes/test-bookings.route.ts
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import {
  searchForTestBooking,
  createTestBooking,
  cancelTestBooking,
} from '../services/test-bookings.service.js'
import type { TestBookingSearchRequest, TestBookingBookRequest } from '@ibe/shared'

async function assertPropertyAccess(
  propertyId: number,
  admin: { role: string; organizationId: number | null },
): Promise<boolean> {
  if (admin.role === 'super') return true
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true },
  })
  return !!prop && prop.organizationId === admin.organizationId
}

export async function testBookingsRoutes(fastify: FastifyInstance) {
  // ── POST /admin/test-bookings/search ────────────────────────────────────────
  fastify.post('/admin/test-bookings/search', async (request, reply) => {
    const body = request.body as TestBookingSearchRequest
    if (!body.propertyId || !body.checkIn || !body.checkOut || typeof body.adults !== 'number') {
      return reply.status(400).send({ error: 'propertyId, checkIn, checkOut, adults are required' })
    }

    if (!await assertPropertyAccess(body.propertyId, request.admin)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    try {
      const rates = await searchForTestBooking(body)
      return reply.send({ rates })
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Search failed' })
    }
  })

  // ── POST /admin/test-bookings/book ──────────────────────────────────────────
  fastify.post('/admin/test-bookings/book', async (request, reply) => {
    const body = request.body as TestBookingBookRequest
    if (!body.propertyId || !body.rateKey || !body.checkIn || !body.checkOut || typeof body.adults !== 'number') {
      return reply.status(400).send({ error: 'propertyId, rateKey, checkIn, checkOut, adults are required' })
    }

    if (!await assertPropertyAccess(body.propertyId, request.admin)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    try {
      const result = await createTestBooking(body)
      return reply.status(201).send(result)
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Booking failed' })
    }
  })

  // ── POST /admin/test-bookings/:bookingId/cancel ──────────────────────────────
  fastify.post('/admin/test-bookings/:bookingId/cancel', async (request, reply) => {
    const bookingId = parseInt((request.params as { bookingId: string }).bookingId, 10)
    if (isNaN(bookingId)) return reply.status(400).send({ error: 'Invalid bookingId' })

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId, isTest: true },
      select: { propertyId: true },
    })
    if (!booking) return reply.status(404).send({ error: 'Test booking not found' })
    if (!await assertPropertyAccess(booking.propertyId, request.admin)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    try {
      const ok = await cancelTestBooking(bookingId)
      return reply.send({ ok })
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Cancel failed' })
    }
  })
}
