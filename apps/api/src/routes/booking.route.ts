import type { FastifyInstance } from 'fastify'
import { CreateBookingRequestSchema, IBE_ERROR_VALIDATION } from '@ibe/shared'
import { book, BookingError } from '../services/booking.service.js'
import { logger } from '../utils/logger.js'
import { extractB2BContext } from '../utils/b2b-context.js'
import { getB2BAdminById } from '../services/b2b-auth.service.js'
import { prisma } from '../db/client.js'
import { sendEmail } from '../services/email.service.js'
import { getCommSettings, getSystemCommSettings } from '../services/communication.service.js'
import { sendWhatsAppMessage } from '../services/whatsapp.service.js'
import { sendMessage as sendWebjsMessage, clientKey } from '../services/whatsapp-manager.service.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getHotelDesignConfig } from '../services/config.service.js'

interface RoomInfo { roomCode: string; board: string }
interface NightlyEntry { date: string; sell: number; currency: string }
interface TaxEntry { description: string; amount: number; currency: string; relation: string }
interface SelectedRoomInfo {
  roomName: string
  nightlyBreakdown: NightlyEntry[]
  sellTaxes: TaxEntry[]
  fees: TaxEntry[]
}

function fmtAmt(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function fmtDateWa(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const day = d.getUTCDate()
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const year = d.getUTCFullYear()
  return `${weekday}, ${day}-${month}-${year}`
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
}

interface HotelContact {
  address?: string
  city?: string
  postcode?: string
  country?: string
  email?: string | null
  phone?: string | null
  website?: string | null
  starRating?: number
}

function bookingEmailHtml(opts: {
  guestName: string
  hotelName: string | null
  ref: string
  hyperGuestBookingId?: number
  checkIn: string
  checkOut: string
  total: string
  currency?: string
  rooms?: RoomInfo[]
  selectedRooms?: SelectedRoomInfo[]
  hotelUrl?: string
  hotelContact?: HotelContact
  logoUrl?: string | null
}): string {
  const { guestName, hotelName, ref, hyperGuestBookingId, checkIn, checkOut, total, currency, rooms, selectedRooms, hotelUrl, hotelContact, logoUrl } = opts
  const n = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : null

  const row = (label: string, value: string, bold = false) =>
    `<tr>
      <td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:6px 0;${bold ? 'font-weight:700;' : ''}color:#111">${value}</td>
    </tr>`

  const sectionHeader = (title: string) =>
    `<tr><td colspan="2" style="padding:18px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;border-top:1px solid #e5e7eb">${title}</td></tr>`

  // Room rows
  let roomRows = ''
  if (rooms && rooms.length > 0) {
    roomRows += sectionHeader(rooms.length === 1 ? 'Room' : 'Rooms')
    rooms.forEach((r, i) => {
      const sr = selectedRooms?.[i]
      const name = sr?.roomName ?? r.roomCode
      roomRows += row(rooms.length > 1 ? `Room ${i + 1}` : 'Room', `${name}${r.board ? ` &nbsp;·&nbsp; ${r.board}` : ''}`)
    })
  }

  // Nightly breakdown rows
  let nightlyRows = ''
  const roomsWithNightly = (selectedRooms ?? []).filter(sr => sr.nightlyBreakdown.length > 0)
  if (roomsWithNightly.length > 0) {
    nightlyRows += sectionHeader('Nightly Breakdown')
    const multiRoom = roomsWithNightly.length > 1
    for (const sr of roomsWithNightly) {
      if (multiRoom) {
        nightlyRows += `<tr><td colspan="2" style="padding:6px 24px 2px;font-size:12px;font-weight:600;color:#374151;">${sr.roomName}</td></tr>`
      }
      for (const n of sr.nightlyBreakdown) {
        nightlyRows += row(fmtDateShort(n.date), fmtAmt(n.sell, n.currency))
      }
    }
  }

  // Taxes & fees rows
  let taxRows = ''
  const allTaxes = selectedRooms?.flatMap(sr => sr.sellTaxes.filter(t => t.relation !== 'ignore')) ?? []
  const allFees  = selectedRooms?.flatMap(sr => sr.fees.filter(f => f.relation !== 'ignore')) ?? []
  if (allTaxes.length > 0 || allFees.length > 0) {
    taxRows += sectionHeader('Taxes & Fees')
    for (const t of [...allTaxes, ...allFees]) {
      const label = t.relation === 'display' ? `${t.description} <span style="color:#b45309">(paid at hotel)</span>`
                  : t.relation === 'optional' ? `${t.description} <span style="color:#1d4ed8">(optional)</span>`
                  : t.description
      taxRows += row(label, fmtAmt(t.amount, t.currency))
    }
  }

  // Hotel info block
  const stars = hotelContact?.starRating ? '★'.repeat(hotelContact.starRating) : ''
  const addressParts = [
    hotelContact?.address,
    hotelContact?.city && hotelContact?.postcode ? `${hotelContact.city} ${hotelContact.postcode}` : (hotelContact?.city ?? hotelContact?.postcode),
    hotelContact?.country,
  ].filter(Boolean)
  const hotelInfoBlock = (hotelContact && (addressParts.length || hotelContact.email || hotelContact.phone || hotelContact.website))
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 24px">
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#111">${hotelName ?? ''}</p>
        ${stars ? `<p style="margin:0 0 10px;color:#f59e0b;font-size:13px">${stars}</p>` : '<div style="margin-bottom:10px"></div>'}
        ${addressParts.length ? `<p style="margin:0 0 4px;font-size:13px;color:#444">🏨 ${addressParts.join(', ')}</p>` : ''}
        ${hotelContact?.phone ? `<p style="margin:0 0 4px;font-size:13px;color:#444">📞 ${hotelContact.phone}</p>` : ''}
        ${hotelContact?.email ? `<p style="margin:0 0 4px;font-size:13px;color:#444">✉️ <a href="mailto:${hotelContact.email}" style="color:#2563eb;text-decoration:none">${hotelContact.email}</a></p>` : ''}
        ${hotelUrl ? `<p style="margin:0;font-size:13px;color:#444">🌐 <a href="${hotelUrl}" style="color:#2563eb;text-decoration:none">Hotel page</a></p>` : ''}
      </div>`
    : ''

  const hotelBtn = hotelUrl
    ? `<div style="margin-top:28px;text-align:center">
        <a href="${hotelUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
          Visit Hotel Page →
        </a>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">

  <!-- Header -->
  <div style="background:#16a34a;padding:28px 32px;text-align:center">
    ${logoUrl ? `<div style="display:inline-block;background:#fff;border-radius:10px;padding:10px 20px;margin-bottom:16px;line-height:0"><img src="${logoUrl}" alt="${hotelName ?? 'Hotel'}" style="max-height:48px;max-width:180px;object-fit:contain;display:block"></div>` : ''}
    <h1 style="margin:0 0 0;color:#fff;font-size:22px;font-weight:700">✓ Booking Confirmed</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px">${hotelName ?? 'Your reservation is confirmed'}</p>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;font-size:15px;color:#111">Dear <strong>${guestName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444">Your booking${hotelName ? ` at <strong>${hotelName}</strong>` : ''} is confirmed. Below are your full booking details.</p>

    ${hotelInfoBlock}

    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${sectionHeader('Booking Details')}
      ${row('Booking reference', ref, true)}
      ${hyperGuestBookingId ? row('HyperGuest ID', String(hyperGuestBookingId)) : ''}
      ${row('Check-in', checkIn ? fmtDate(checkIn) : '')}
      ${row('Check-out', checkOut ? fmtDate(checkOut) : '')}
      ${n ? row('Duration', `${n} night${n !== 1 ? 's' : ''}`) : ''}
      ${roomRows}
      ${nightlyRows}
      ${taxRows}
      ${sectionHeader('Total')}
      ${row('Total amount', total, true)}
    </table>

    ${hotelBtn}

    <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;text-align:center">Please keep your booking reference for your records.</p>
  </div>

</div>
</body></html>`
}

export async function bookingRoutes(fastify: FastifyInstance) {
  // ── Send booking confirmation via email or WhatsApp ───────────────────────
  fastify.post('/bookings/:id/send-confirmation', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      channel: 'email' | 'whatsapp'
      to: string
      // Inline fields (always passed from frontend; required for demo bookings)
      propertyId?: number
      guestName?: string
      checkIn?: string
      checkOut?: string
      totalAmount?: number
      currency?: string
      hyperGuestBookingId?: number
      rooms?: RoomInfo[]
      selectedRooms?: SelectedRoomInfo[]
    }
    const { channel, to } = body

    if (!channel || !to || !['email', 'whatsapp'].includes(channel)) {
      return reply.status(400).send({ error: 'channel and to are required' })
    }

    let orgId: number
    let hotelName: string | null = null
    let ref: string
    let checkIn: string
    let checkOut: string
    let guestName: string
    let total: string
    let hyperGuestBookingId: number | undefined

    const numericId = Number(id)
    if (Number.isFinite(numericId)) {
      // Real booking: core fields from DB; enrichment (rooms/nightly/taxes/url) from inline body
      const booking = await prisma.booking.findUnique({ where: { id: numericId } })
      if (!booking) return reply.status(404).send({ error: 'Booking not found' })
      const property = await prisma.property.findUnique({ where: { propertyId: booking.propertyId } })
      if (!property) return reply.status(404).send({ error: 'Property not found' })
      orgId = property.organizationId
      hotelName = property.name
      ref = `#${booking.id}`
      checkIn = booking.checkIn?.toISOString().slice(0, 10) ?? ''
      checkOut = booking.checkOut?.toISOString().slice(0, 10) ?? ''
      guestName = [booking.leadGuestFirstName, booking.leadGuestLastName].filter(Boolean).join(' ')
      total = fmtAmt(Number(booking.totalAmount), booking.currency)
      hyperGuestBookingId = booking.hyperGuestBookingId
    } else {
      // Demo booking: all data from inline body; orgId=0 → falls back to system comm settings
      orgId = 0
      if (body.propertyId) {
        const property = await prisma.property.findUnique({ where: { propertyId: body.propertyId } })
        if (property) { orgId = property.organizationId; hotelName = property.name }
      }
      ref = id
      checkIn = body.checkIn ?? ''
      checkOut = body.checkOut ?? ''
      guestName = body.guestName ?? ''
      total = body.totalAmount ? fmtAmt(body.totalAmount, body.currency ?? 'USD') : ''
      hyperGuestBookingId = body.hyperGuestBookingId
    }

    try {
      if (channel === 'email') {
        const pid = Number.isFinite(numericId)
          ? (await prisma.booking.findUnique({ where: { id: numericId }, select: { propertyId: true } }))?.propertyId
          : body.propertyId
        const base = (process.env.WEB_BASE_URL ?? '').replace(/\/$/, '')
        const hotelUrl = base && pid ? `${base}/?hotelId=${pid}` : undefined

        // Fetch hotel contact info and logo (best-effort, parallel)
        let hotelContact: HotelContact | undefined
        let logoUrl: string | null = null
        let logoInlineImage: { cid: string; content: Buffer; contentType: string } | null = null
        await Promise.all([
          pid ? fetchPropertyStatic(pid).then(s => {
            hotelContact = {
              ...(s.location.address ? { address: s.location.address } : {}),
              ...(s.location.city?.name ? { city: s.location.city.name } : {}),
              ...(s.location.postcode ? { postcode: s.location.postcode } : {}),
              ...(s.location.countryCode ? { country: s.location.countryCode } : {}),
              ...(s.contact.email ? { email: s.contact.email } : {}),
              ...(s.contact.phone ? { phone: s.contact.phone } : {}),
              ...(s.contact.website ? { website: s.contact.website } : {}),
              ...(s.rating ? { starRating: s.rating } : {}),
            }
          }).catch(() => {}) : Promise.resolve(),
          pid ? getHotelDesignConfig(pid).then(cfg => {
            if (cfg.logoUrl) {
              if (cfg.logoUrl.startsWith('data:')) {
                // Base64 data URL — convert to inline CID attachment for email client compatibility
                const match = cfg.logoUrl.match(/^data:([^;]+);base64,(.+)$/)
                if (match && match[1] && match[2]) {
                  logoInlineImage = { cid: 'hotel-logo', content: Buffer.from(match[2], 'base64'), contentType: match[1] }
                  logoUrl = 'cid:hotel-logo'
                }
              } else {
                logoUrl = cfg.logoUrl.startsWith('http') ? cfg.logoUrl : `${base}${cfg.logoUrl.startsWith('/') ? '' : '/'}${cfg.logoUrl}`
              }
            }
          }).catch(() => {}) : Promise.resolve(),
        ])

        const html = bookingEmailHtml({
          guestName, hotelName, ref, checkIn, checkOut, total,
          ...(hyperGuestBookingId !== undefined ? { hyperGuestBookingId } : {}),
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.rooms !== undefined ? { rooms: body.rooms } : {}),
          ...(body.selectedRooms !== undefined ? { selectedRooms: body.selectedRooms } : {}),
          ...(hotelUrl !== undefined ? { hotelUrl } : {}),
          ...(hotelContact !== undefined ? { hotelContact } : {}),
          logoUrl,
        })
        const subject = `Booking confirmed ${ref}${hotelName ? ` — ${hotelName}` : ''}`
        const result = await sendEmail(orgId, { to, subject, html, ...(logoInlineImage ? { inlineImages: [logoInlineImage] } : {}) })
        if (!result.ok) return reply.status(502).send({ error: result.error ?? 'Email send failed' })
        return reply.send({ ok: true })
      }

      if (channel === 'whatsapp') {
        const settings = orgId > 0
          ? await getCommSettings(orgId)
          : await getSystemCommSettings()
        if (!settings.whatsappEnabled) return reply.status(400).send({ error: 'WhatsApp not configured' })

        const waPid = Number.isFinite(numericId)
          ? (await prisma.booking.findUnique({ where: { id: numericId }, select: { propertyId: true } }))?.propertyId
          : body.propertyId
        let waAddress: string | null = null
        if (waPid) {
          await fetchPropertyStatic(waPid).then(s => {
            const parts = [s.location.address, s.location.city?.name, s.location.countryCode].filter(Boolean)
            if (parts.length) waAddress = parts.join(', ')
          }).catch(() => {})
        }

        const lines = [
          `✓ Booking confirmed${hotelName ? ` at ${hotelName}` : ''}`,
          ...(waAddress ? [waAddress] : []),
          ``,
          `Reference: ${ref}`,
          `Guest: ${guestName}`,
          `Check-in: ${checkIn ? fmtDateWa(checkIn) : ''}`,
          `Check-out: ${checkOut ? fmtDateWa(checkOut) : ''}`,
          `Total: ${total}`,
        ]
        const text = lines.join('\n')

        if (settings.whatsappProvider === 'meta') {
          if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken) {
            return reply.status(400).send({ error: 'WhatsApp not configured' })
          }
          await sendWhatsAppMessage(settings.whatsappPhoneNumberId, settings.whatsappAccessToken, to, text)
        } else if (settings.whatsappProvider === 'twilio') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const twilio = await import('twilio' as any)
          const client = new twilio.default(settings.whatsappTwilioAccountSid, settings.whatsappTwilioAuthToken!)
          await client.messages.create({ from: `whatsapp:${settings.whatsappTwilioNumber}`, to: `whatsapp:${to}`, body: text })
        } else if (settings.whatsappProvider === 'wwebjs') {
          const ctx = orgId > 0 ? { orgId } : {}
          logger.info({ ctx: clientKey(ctx) }, '[BookingRoute] Sending via internal wwebjs client')
          await sendWebjsMessage(ctx, to, text)
        }
        return reply.send({ ok: true })
      }
    } catch (err) {
      logger.error({ err }, '[BookingRoute] Send confirmation failed')
      return reply.status(502).send({ error: err instanceof Error ? err.message : 'Send failed' })
    }
  })

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
