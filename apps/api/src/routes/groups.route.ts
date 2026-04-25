import type { FastifyInstance } from 'fastify'
import {
  getGroupConfig, updateGroupConfig,
  getPropertyGroupOverride, upsertPropertyGroupOverride,
  getResolvedGroupConfig, getGroupEmail,
} from '../services/groups.service.js'
import { sendEmail } from '../services/email.service.js'
import { getCommSettings } from '../services/communication.service.js'
import { prisma } from '../db/client.js'
import type { GroupInquiryRequest } from '@ibe/shared'

export async function groupsAdminRoutes(fastify: FastifyInstance) {
  // GET /admin/groups/config?orgId=X
  fastify.get('/admin/groups/config', async (request, reply) => {
    const { orgId: rawOrgId } = request.query as { orgId?: string }
    const admin = request.admin
    const orgId = admin.role === 'super' && rawOrgId ? parseInt(rawOrgId, 10) : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await getGroupConfig(orgId))
  })

  // PUT /admin/groups/config
  fastify.put('/admin/groups/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const admin = request.admin
    const orgId = admin.role === 'super' && body.orgId ? Number(body.orgId) : (admin.organizationId ?? null)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const { orgId: _orgId, ...update } = body
    void _orgId
    return reply.send(await updateGroupConfig(orgId, update as Parameters<typeof updateGroupConfig>[1]))
  })

  // GET /admin/groups/property/:propertyId
  fastify.get('/admin/groups/property/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const prop = await prisma.property.findUnique({ where: { propertyId: parseInt(rawId, 10) } })
    if (!prop) return reply.status(404).send({ error: 'Property not found' })
    return reply.send(await getPropertyGroupOverride(prop.id))
  })

  // PUT /admin/groups/property/:propertyId
  fastify.put('/admin/groups/property/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const prop = await prisma.property.findUnique({ where: { propertyId: parseInt(rawId, 10) } })
    if (!prop) return reply.status(404).send({ error: 'Property not found' })
    const body = request.body as Parameters<typeof upsertPropertyGroupOverride>[2]
    return reply.send(await upsertPropertyGroupOverride(prop.id, prop.organizationId, body))
  })
}

export async function groupsPublicRoutes(fastify: FastifyInstance) {
  // GET /groups/config/:propertyId — resolved public config (no groupEmail exposed)
  fastify.get('/groups/config/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const propertyId = parseInt(rawId, 10)
    if (isNaN(propertyId) || propertyId <= 0) return reply.status(400).send({ error: 'Invalid propertyId' })
    const cfg = await getResolvedGroupConfig(propertyId)
    if (!cfg) return reply.status(404).send({ error: 'Property not found' })
    void reply.header('Cache-Control', 'public, max-age=60')
    return reply.send(cfg)
  })

  // POST /groups/inquiry — offline inquiry email
  fastify.post('/groups/inquiry', async (request, reply) => {
    const body = request.body as GroupInquiryRequest
    if (!body.propertyId || !body.contactEmail || !body.rooms?.length) {
      return reply.status(400).send({ error: 'Missing required fields' })
    }

    const prop = await prisma.property.findUnique({ where: { propertyId: body.propertyId } })
    if (!prop) return reply.status(404).send({ error: 'Property not found' })

    const groupEmail = await getGroupEmail(body.propertyId)
    if (!groupEmail) return reply.status(400).send({ error: 'Group department email not configured' })

    const orgId = prop.organizationId
    const roomRows = body.rooms.map(r =>
      `<tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb">${r.roomName}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center">${r.quantity}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right">${body.currency} ${r.unitPrice.toFixed(2)} × ${r.nights} nights</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:600">${body.currency} ${r.totalAmount.toFixed(2)}</td>
      </tr>`
    ).join('')

    const hotelHtml = `
      <h2 style="color:#1f2937">New Group Booking Inquiry</h2>
      <p><strong>Check-in:</strong> ${body.checkIn} &nbsp; <strong>Check-out:</strong> ${body.checkOut}</p>
      <p><strong>Contact:</strong> ${body.contactName} &lt;${body.contactEmail}&gt;${body.contactPhone ? ` · ${body.contactPhone}` : ''}</p>
      <p><strong>Nationality:</strong> ${body.nationality}</p>
      ${body.message ? `<p><strong>Message:</strong> ${body.message}</p>` : ''}
      <table style="border-collapse:collapse;width:100%;margin-top:16px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left">Room</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb">Qty</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb">Rate</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb">Total</th>
          </tr>
        </thead>
        <tbody>${roomRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb">
            <td colspan="3" style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:600">Grand Total</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:700">${body.currency} ${body.totalAmount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="margin-top:16px;color:#6b7280;font-size:12px">Reply directly to this email to contact the guest.</p>
    `

    const guestHtml = `
      <h2 style="color:#1f2937">We've received your group booking request</h2>
      <p>Thank you, ${body.contactName}. Our groups team will review your request and get back to you within 24 hours.</p>
      <p><strong>Check-in:</strong> ${body.checkIn} &nbsp; <strong>Check-out:</strong> ${body.checkOut}</p>
      <p><strong>Total estimate:</strong> ${body.currency} ${body.totalAmount.toFixed(2)}</p>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">Please quote your enquiry when following up.</p>
    `

    const settings = await getCommSettings(orgId)
    if (!settings.emailEnabled) {
      return reply.status(422).send({ error: 'Email not configured for this property. Please contact the hotel directly.' })
    }

    const [hotelResult, guestResult] = await Promise.all([
      sendEmail(orgId, {
        to: groupEmail,
        subject: `Group Inquiry: ${body.checkIn} → ${body.checkOut} (${body.contactName})`,
        html: hotelHtml,
        replyTo: body.contactEmail,
      }),
      sendEmail(orgId, {
        to: body.contactEmail,
        subject: 'Your group booking request has been received',
        html: guestHtml,
      }),
    ])

    if (!hotelResult.ok) {
      return reply.status(500).send({ error: `Failed to send inquiry: ${hotelResult.error}` })
    }

    return reply.send({ ok: true, guestEmailSent: guestResult.ok })
  })
}
