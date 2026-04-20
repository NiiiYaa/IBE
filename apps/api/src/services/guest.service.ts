import bcrypt from 'bcryptjs'
import { prisma } from '../db/client.js'
import { cancelBooking as hgCancelBooking } from '../adapters/hyperguest/booking.js'

// ── Auth ──────────────────────────────────────────────────────────────────────

export class GuestExistsError extends Error { constructor() { super('GUEST_EXISTS') } }
export class GuestNotFoundError extends Error { constructor() { super('GUEST_NOT_FOUND') } }
export class InvalidCredentialsError extends Error { constructor() { super('INVALID_CREDENTIALS') } }
export class GuestBlockedError extends Error { constructor() { super('GUEST_BLOCKED') } }
export class OrgNotFoundError extends Error { constructor() { super('ORG_NOT_FOUND') } }

/** Resolve organizationId from a HyperGuest propertyId (the external integer ID). */
export async function resolveOrgIdFromProperty(propertyId: number): Promise<number> {
  const prop = await prisma.property.findUnique({
    where: { propertyId },
    select: { organizationId: true, organization: { select: { isActive: true, deletedAt: true } } },
  })
  if (!prop || !prop.organization.isActive || prop.organization.deletedAt) throw new OrgNotFoundError()
  return prop.organizationId
}

export async function registerGuest(data: {
  organizationId: number
  email: string; password: string
  firstName: string; lastName: string
  phone?: string; nationality?: string
}) {
  const email = data.email.toLowerCase().trim()
  const existing = await prisma.guest.findUnique({ where: { organizationId_email: { organizationId: data.organizationId, email } } })
  if (existing) throw new GuestExistsError()
  const passwordHash = await bcrypt.hash(data.password, 10)
  return prisma.guest.create({
    data: {
      organizationId: data.organizationId,
      email,
      passwordHash,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      phone: data.phone?.trim() || null,
      nationality: data.nationality?.trim() || null,
    },
  })
}

export async function loginGuest(organizationId: number, email: string, password: string) {
  const guest = await prisma.guest.findUnique({ where: { organizationId_email: { organizationId, email: email.toLowerCase().trim() } } })
  if (!guest || !guest.passwordHash) throw new InvalidCredentialsError()
  if (guest.isBlocked) throw new GuestBlockedError()
  const valid = await bcrypt.compare(password, guest.passwordHash)
  if (!valid) throw new InvalidCredentialsError()
  return guest
}

export async function findOrCreateGoogleGuest(data: {
  organizationId: number; email: string; firstName: string; lastName: string
}) {
  const email = data.email.toLowerCase().trim()
  const existing = await prisma.guest.findUnique({ where: { organizationId_email: { organizationId: data.organizationId, email } } })
  if (existing) {
    if (existing.isBlocked) throw new GuestBlockedError()
    return existing
  }
  return prisma.guest.create({
    data: { organizationId: data.organizationId, email, passwordHash: null, firstName: data.firstName, lastName: data.lastName },
  })
}

export async function getGuestById(id: number) {
  const guest = await prisma.guest.findUnique({ where: { id } })
  if (!guest) throw new GuestNotFoundError()
  return guest
}

export async function updateGuestProfile(id: number, data: {
  firstName?: string; lastName?: string
  phone?: string | null; nationality?: string | null
}) {
  return prisma.guest.update({ where: { id }, data })
}

export async function updateGuestPassword(id: number, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10)
  return prisma.guest.update({ where: { id }, data: { passwordHash } })
}

export async function deleteGuestAccount(id: number) {
  const guest = await prisma.guest.findUnique({ where: { id }, select: { organizationId: true } })
  if (!guest) throw new GuestNotFoundError()
  // Anonymise — don't hard-delete so booking history stays intact
  // Keep organizationId so the slot can be reused and the record stays scoped
  await prisma.guest.update({
    where: { id },
    data: {
      email: `deleted_${id}@deleted.invalid`,
      passwordHash: null,
      firstName: '[Deleted]',
      lastName: '[Deleted]',
      phone: null,
      nationality: null,
    },
  })
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export async function getGuestBookings(guestId: number, email: string) {
  return prisma.booking.findMany({
    where: { leadGuestEmail: email, property: { organizationId: (await prisma.guest.findUnique({ where: { id: guestId }, select: { organizationId: true } }))!.organizationId } },
    include: { rooms: true },
    orderBy: { checkIn: 'desc' },
  })
}

export async function getGuestBookingById(bookingId: number, guestId: number, email: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId }, select: { organizationId: true } })
  if (!guest) return null
  return prisma.booking.findFirst({
    where: { id: bookingId, leadGuestEmail: email, property: { organizationId: guest.organizationId } },
    include: { rooms: true, affiliateBooking: { include: { affiliate: true } } },
  })
}

export async function cancelGuestBooking(bookingId: number, guestId: number, email: string): Promise<boolean> {
  const guest = await prisma.guest.findUnique({ where: { id: guestId }, select: { organizationId: true } })
  if (!guest) return false
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, leadGuestEmail: email, status: { not: 'cancelled' }, property: { organizationId: guest.organizationId } },
  })
  if (!booking) return false
  if (booking.cancellationDeadline && new Date() > booking.cancellationDeadline) return false
  await hgCancelBooking(booking.hyperGuestBookingId, booking.propertyId)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } })
  return true
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function listGuests(params: {
  organizationId: number
  search?: string; isBlocked?: boolean; page: number; pageSize: number
}) {
  const where: Record<string, unknown> = { organizationId: params.organizationId }
  if (params.isBlocked != null) where['isBlocked'] = params.isBlocked
  if (params.search) {
    where['OR'] = [
      { firstName: { contains: params.search } },
      { lastName: { contains: params.search } },
      { email: { contains: params.search } },
    ]
  }
  where['NOT'] = { email: { endsWith: '@deleted.invalid' } }

  const [total, guests] = await Promise.all([
    prisma.guest.count({ where }),
    prisma.guest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ])
  return { total, guests }
}

export async function getGuestStats(guestId: number, email: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId }, select: { organizationId: true } })
  if (!guest) return { bookingCount: 0, totalSpend: 0, lastStay: null }

  const bookings = await prisma.booking.findMany({
    where: { leadGuestEmail: email, property: { organizationId: guest.organizationId } },
    select: { totalAmount: true, checkOut: true, status: true },
  })
  const active = bookings.filter(b => b.status !== 'cancelled')
  const totalSpend = active.reduce((s, b) => s + Number(b.totalAmount), 0)
  const past = active.filter(b => new Date(b.checkOut) < new Date())
  const lastStay = past.sort((a, b) => new Date(b.checkOut).getTime() - new Date(a.checkOut).getTime())[0]
  return {
    bookingCount: bookings.length,
    totalSpend,
    lastStay: lastStay?.checkOut.toISOString() ?? null,
  }
}

export async function addGuestNote(guestId: number, authorId: number | null, authorName: string, content: string) {
  return prisma.guestNote.create({ data: { guestId, authorId, authorName, content } })
}

export async function deleteGuestNote(noteId: number) {
  return prisma.guestNote.delete({ where: { id: noteId } })
}

export async function setGuestBlocked(id: number, isBlocked: boolean, reason?: string) {
  return prisma.guest.update({
    where: { id },
    data: { isBlocked, blockedReason: isBlocked ? (reason ?? null) : null },
  })
}
