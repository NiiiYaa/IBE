import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'
import type { AdminBookingRow, AdminBookingsResponse } from '@ibe/shared'
import { getPropertyDetail } from '../services/static.service.js'

const PAGE_SIZE = 50
const PII_ROLES = new Set(['super', 'admin'])

function maskName(name: string): string {
  return name.split(' ').map(part => part.slice(0, 2) + '**').join(' ')
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '**@**'
  const [host] = domain.split('.')
  const ext = domain.includes('.') ? domain.slice(domain.indexOf('.')) : ''
  return `${local.slice(0, 2)}**@${(host ?? '').slice(0, 2)}***${ext}`
}

type DatePivot = 'bookingDate' | 'checkIn' | 'checkOut' | 'cancellationDeadline' | 'cancellationDate'
type Preset = 'booked-today' | 'checkin-today' | 'checkout-today' | 'staying' | 'deadline-today' | 'cancelled-today'

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(); end.setHours(23, 59, 59, 999)
  return { start, end }
}

function applyDateFilter(
  where: Record<string, unknown>,
  pivot: DatePivot,
  dateFrom: string | undefined,
  dateTo: string | undefined,
) {
  if (!dateFrom && !dateTo) return
  const range: Record<string, Date> = {}
  if (dateFrom) range['gte'] = new Date(dateFrom)
  if (dateTo) range['lte'] = new Date(dateTo + 'T23:59:59Z')
  const field: Record<DatePivot, string> = {
    bookingDate:          'createdAt',
    checkIn:              'checkIn',
    checkOut:             'checkOut',
    cancellationDeadline: 'cancellationDeadline',
    cancellationDate:     'updatedAt',
  }
  where[field[pivot]] = range
  if (pivot === 'cancellationDate') where['status'] = 'cancelled'
}

function applyPreset(where: Record<string, unknown>, preset: Preset) {
  const { start, end } = todayRange()
  switch (preset) {
    case 'booked-today':
      where['createdAt'] = { gte: start, lte: end }
      break
    case 'checkin-today':
      where['checkIn'] = { gte: start, lte: end }
      break
    case 'checkout-today':
      where['checkOut'] = { gte: start, lte: end }
      break
    case 'staying':
      where['checkIn'] = { lte: end }
      where['checkOut'] = { gte: start }
      break
    case 'deadline-today':
      where['cancellationDeadline'] = { gte: start, lte: end }
      break
    case 'cancelled-today':
      where['status'] = 'cancelled'
      where['updatedAt'] = { gte: start, lte: end }
      break
  }
}

export async function adminBookingsRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/bookings', async (request, reply) => {
    const organizationId = request.admin.organizationId
    const isSuper = request.admin.role === 'super'

    const q = request.query as {
      page?: string
      status?: string
      propertyId?: string
      datePivot?: string
      dateFrom?: string
      dateTo?: string
      search?: string
      hasAffiliate?: string
      hasPromo?: string
      isTest?: string
      preset?: string
    }

    const page = Math.max(1, parseInt(q.page ?? '1', 10))

    const orgProperties = organizationId
      ? await prisma.property.findMany({
          where: { organizationId, deletedAt: null },
          select: { propertyId: true, organizationId: true },
        })
      : null

    const where: Record<string, unknown> = {}

    if (orgProperties) {
      where['propertyId'] = { in: orgProperties.map(p => p.propertyId) }
    }
    if (q.status) where['status'] = q.status
    if (q.propertyId) where['propertyId'] = parseInt(q.propertyId, 10)
    if (q.search) {
      where['OR'] = [
        { leadGuestFirstName: { contains: q.search } },
        { leadGuestLastName: { contains: q.search } },
        { leadGuestEmail: { contains: q.search } },
        { agencyReference: { contains: q.search } },
      ]
    }
    if (q.hasAffiliate === 'true') where['affiliateId'] = { not: null }
    if (q.hasAffiliate === 'false') where['affiliateId'] = null
    if (q.hasPromo === 'true') where['promoCode'] = { not: null }
    if (q.hasPromo === 'false') where['promoCode'] = null
    if (q.isTest === 'true') where['isTest'] = true
    if (q.isTest === 'false') where['isTest'] = false

    if (q.preset) {
      applyPreset(where, q.preset as Preset)
    } else {
      const pivot = (q.datePivot ?? 'bookingDate') as DatePivot
      applyDateFilter(where, pivot, q.dateFrom, q.dateTo)
    }

    const [total, rows] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          rooms: true,
          affiliateBooking: { include: { affiliate: true } },
        },
      }),
    ])

    const uniquePropertyIds = [...new Set(rows.map(r => r.propertyId))]
    const propertyDetails = await Promise.allSettled(
      uniquePropertyIds.map(id => getPropertyDetail(id))
    )
    const propertyMap: Record<number, { name: string; address: string }> = {}
    uniquePropertyIds.forEach((id, i) => {
      const result = propertyDetails[i]
      if (result?.status === 'fulfilled' && result.value) {
        propertyMap[id] = {
          name: result.value.name,
          address: `${result.value.location.address}, ${result.value.location.city}`,
        }
      }
    })

    const orgMap: Record<number, number> = {}
    if (isSuper && !orgProperties) {
      const props = await prisma.property.findMany({
        where: { propertyId: { in: uniquePropertyIds } },
        select: { propertyId: true, organizationId: true },
      })
      props.forEach(p => { orgMap[p.propertyId] = p.organizationId })
    } else if (orgProperties) {
      orgProperties.forEach(p => { orgMap[p.propertyId] = p.organizationId })
    }

    const canSeePII = PII_ROLES.has(request.admin.role)

    const bookings: AdminBookingRow[] = rows.map(row => {
      const nights = Math.round(
        (new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) / 86400000
      )
      const ab = row.affiliateBooking
      const prop = propertyMap[row.propertyId]

      return {
        id: row.id,
        hyperGuestBookingId: row.hyperGuestBookingId,
        status: row.status,
        organizationId: orgMap[row.propertyId] ?? organizationId,
        propertyId: row.propertyId,
        hotelName: prop?.name ?? null,
        hotelAddress: prop?.address ?? null,
        bookingDate: row.createdAt.toISOString(),
        cancellationDeadline: row.cancellationDeadline?.toISOString() ?? null,
        checkIn: row.checkIn.toISOString().slice(0, 10),
        checkOut: row.checkOut.toISOString().slice(0, 10),
        nights,
        cancellationDate: row.status === 'cancelled' ? row.updatedAt.toISOString() : null,
        currency: row.currency,
        originalPrice: row.originalPrice ? Number(row.originalPrice) : null,
        discountedPrice: Number(row.totalAmount),
        promoCode: row.promoCode,
        promoDiscountPct: row.promoDiscountPct ? Number(row.promoDiscountPct) : null,
        affiliateCode: row.affiliateId ?? null,
        affiliateName: ab?.affiliate.name ?? null,
        affiliateDiscountPct: ab?.affiliate.discountRate ? Number(ab.affiliate.discountRate) : null,
        commissionPct: ab ? Number(ab.commissionRate) : null,
        commissionValue: ab ? Number(ab.commissionAmount) : null,
        guestName: canSeePII
          ? `${row.leadGuestFirstName} ${row.leadGuestLastName}`.trim()
          : maskName(`${row.leadGuestFirstName} ${row.leadGuestLastName}`.trim()),
        guestEmail: canSeePII ? row.leadGuestEmail : maskEmail(row.leadGuestEmail),
        paymentMethod: row.paymentMethod,
        roomCount: row.rooms.length,
        agencyReference: row.agencyReference ?? null,
        isTest: row.isTest,
      }
    })

    const response: AdminBookingsResponse = { bookings, total, page, pageSize: PAGE_SIZE }
    return reply.send(response)
  })
}
