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
    const { orgId: rawOrgId } = request.query as { orgId?: string }
    const fallbackOrgId = rawOrgId ? parseInt(rawOrgId, 10) : undefined
    const cfg = await getResolvedGroupConfig(propertyId, fallbackOrgId)
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

    const [groupEmail, cfg, settings] = await Promise.all([
      getGroupEmail(body.propertyId),
      getResolvedGroupConfig(body.propertyId),
      getCommSettings(prop.organizationId),
    ])
    if (!groupEmail) return reply.status(400).send({ error: 'Group department email not configured' })
    if (!settings.emailEnabled) {
      return reply.status(422).send({ error: 'Email not configured for this property. Please contact the hotel directly.' })
    }

    const cur = body.currency
    const fmt = (n: number) => `${cur} ${n.toFixed(2)}`

    // ── Date helpers ──────────────────────────────────────────────────────────
    function deadlineParts(triggerType: string, daysBefore?: number | null): [string, string] {
      const fmt2 = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      if (triggerType === 'on_confirmation') return ['On booking confirmation', fmt2(new Date())]
      const d = new Date(body.checkIn + 'T12:00:00')
      d.setDate(d.getDate() - (daysBefore ?? 0))
      return [`${daysBefore ?? 0} days prior to check-in`, fmt2(d)]
    }
    function deadlineLabel(triggerType: string, daysBefore?: number | null): string {
      const [label, date] = deadlineParts(triggerType, daysBefore)
      return triggerType === 'on_confirmation' ? label : `${label} (${date})`
    }

    // ── Section helpers ───────────────────────────────────────────────────────
    const section = (title: string, content: string) =>
      `<div style="margin-top:24px">
        <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;padding-bottom:6px">${title}</h3>
        ${content}
      </div>`

    const table = (head: string, rows: string, foot?: string) =>
      `<table style="border-collapse:collapse;width:100%">
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
        ${foot ? `<tfoot>${foot}</tfoot>` : ''}
      </table>`

    const th = (label: string, align = 'left') =>
      `<th style="padding:7px 12px;border:1px solid #e5e7eb;background:#f3f4f6;text-align:${align};font-size:12px">${label}</th>`
    const td = (val: string, align = 'left', bold = false) =>
      `<td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:${align}${bold ? ';font-weight:700' : ''}">${val}</td>`

    // ── Rooms ─────────────────────────────────────────────────────────────────
    const roomsSection = section('Rooms', table(
      `<tr>${th('Room')}${th('Qty', 'center')}${th('Rate / night', 'right')}${th('Nights', 'center')}${th('Total', 'right')}</tr>`,
      body.rooms.map(r =>
        `<tr>${td(r.roomName)}${td(String(r.quantity), 'center')}${td(fmt(r.unitPrice), 'right')}${td(String(r.nights), 'center')}${td(fmt(r.totalAmount), 'right', true)}</tr>`
      ).join(''),
    ))

    // ── Meals ─────────────────────────────────────────────────────────────────
    const mealsSection = body.meals?.length ? section('Meals', table(
      `<tr>${th('Meal')}${th('Adults', 'center')}${th('Children', 'center')}${th('Infants', 'center')}${th('Nights', 'center')}${th('Total', 'right')}</tr>`,
      body.meals.map(m => {
        const label = m.type.charAt(0).toUpperCase() + m.type.slice(1)
        return `<tr>${td(label)}${td(String(m.adults), 'center')}${td(String(m.children), 'center')}${td(String(m.infants), 'center')}${td(String(m.nights), 'center')}${td(fmt(m.totalAmount), 'right', true)}</tr>`
      }).join(''),
    )) : ''

    // ── Meeting / conference room ─────────────────────────────────────────────
    const meetingSection = body.meetingRoom ? section('Conference Room', table(
      `<tr>${th('Item')}${th('Rate / day', 'right')}${th('Nights', 'center')}${th('Total', 'right')}</tr>`,
      `<tr>${td('Conference room')}${td(fmt(body.meetingRoom.pricePerDay), 'right')}${td(String(body.meetingRoom.nights), 'center')}${td(fmt(body.meetingRoom.totalAmount), 'right', true)}</tr>`,
    )) : ''

    // ── Free rooms ────────────────────────────────────────────────────────────
    const freeRoomsSection = cfg?.freeRoomsConfig.enabled && cfg.freeRoomsConfig.count > 0
      ? section('Complimentary Rooms', `<p style="margin:0;font-size:14px;color:#374151">${cfg.freeRoomsConfig.count} complimentary room${cfg.freeRoomsConfig.count !== 1 ? 's' : ''} included with this group booking.</p>`)
      : ''

    // ── Grand total ───────────────────────────────────────────────────────────
    const totalSection = `
      <div style="margin-top:20px;text-align:right">
        <span style="font-size:16px;font-weight:700;color:#111827">Grand Total: ${fmt(body.totalAmount)}</span>
      </div>`

    // ── Cancellation policy ───────────────────────────────────────────────────
    const cancelRanges = cfg?.cancellationRanges ?? []
    const cancellationSection = cancelRanges.length > 0 ? section('Cancellation Policy', table(
      `<tr>${th('Deadline')}${th('Charge', 'right')}${th('Estimated Amount', 'right')}</tr>`,
      cancelRanges.map(r =>
        `<tr>${td(deadlineLabel(r.triggerType, r.daysBeforeCheckin))}${td(`${r.pct}%`, 'right')}${td(fmt(body.totalAmount * r.pct / 100), 'right', true)}</tr>`
      ).join(''),
    )) : ''

    // ── Payment schedule ──────────────────────────────────────────────────────
    const payRanges = cfg
      ? (cfg.paymentInParWithCancellation ? cfg.cancellationRanges : cfg.paymentRanges)
      : []
    const paymentSection = payRanges.length > 0 ? section('Payment Schedule', table(
      `<tr>${th('Due Date')}${th('Percentage', 'right')}${th('Estimated Amount', 'right')}</tr>`,
      payRanges.map(r =>
        `<tr>${td(deadlineLabel(r.triggerType, r.daysBeforeCheckin))}${td(`${r.pct}%`, 'right')}${td(fmt(body.totalAmount * r.pct / 100), 'right', true)}</tr>`
      ).join(''),
    )) : ''

    // ── Group policies ────────────────────────────────────────────────────────
    const policiesSection = cfg?.groupPolicies
      ? section('Group Policies', `<p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.6">${cfg.groupPolicies}</p>`)
      : ''

    // ── CSV attachment ────────────────────────────────────────────────────────
    const esc = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csvRow = (...cols: (string | number)[]) => cols.map(esc).join(',')

    const n = (v: number) => v.toFixed(2)

    const csvLines: string[] = [
      csvRow('Group Booking Inquiry'),
      csvRow('Check-in', body.checkIn, 'Check-out', body.checkOut),
      csvRow('Contact', body.contactName, body.contactEmail, body.contactPhone ?? ''),
      csvRow('Nationality', body.nationality),
      ...(body.message ? [csvRow('Message', body.message)] : []),
      '',
      csvRow('ROOMS', '', '', '', '', ''),
      csvRow('Room', 'Qty', 'Rate/night', 'Currency', 'Nights', 'Total', 'Currency'),
      ...body.rooms.map(r => csvRow(r.roomName, r.quantity, n(r.unitPrice), cur, r.nights, n(r.totalAmount), cur)),
    ]

    if (body.meals?.length) {
      csvLines.push('', csvRow('MEALS', '', '', '', '', '', ''))
      csvLines.push(csvRow('Meal', 'Adults', 'Children', 'Infants', 'Nights', 'Total', 'Currency'))
      body.meals.forEach(m => {
        const label = m.type.charAt(0).toUpperCase() + m.type.slice(1)
        csvLines.push(csvRow(label, m.adults, m.children, m.infants, m.nights, n(m.totalAmount), cur))
      })
    }

    if (body.meetingRoom) {
      csvLines.push('', csvRow('CONFERENCE ROOM', '', '', '', ''))
      csvLines.push(csvRow('Item', 'Rate/day', 'Currency', 'Nights', 'Total', 'Currency'))
      csvLines.push(csvRow('Conference room', n(body.meetingRoom.pricePerDay), cur, body.meetingRoom.nights, n(body.meetingRoom.totalAmount), cur))
    }

    if (cfg?.freeRoomsConfig.enabled && cfg.freeRoomsConfig.count > 0) {
      csvLines.push('', csvRow('COMPLIMENTARY ROOMS', cfg.freeRoomsConfig.count))
    }

    csvLines.push('', csvRow('GRAND TOTAL', n(body.totalAmount), cur))

    if (cancelRanges.length > 0) {
      csvLines.push('', csvRow('CANCELLATION POLICY', '', '', '', ''))
      csvLines.push(csvRow('Deadline', 'Date', 'Charge %', 'Estimated Amount', 'Currency'))
      cancelRanges.forEach(r => {
        const [label, date] = deadlineParts(r.triggerType, r.daysBeforeCheckin)
        csvLines.push(csvRow(label, date, `${r.pct}%`, n(body.totalAmount * r.pct / 100), cur))
      })
    }

    if (payRanges.length > 0) {
      csvLines.push('', csvRow('PAYMENT SCHEDULE', '', '', '', ''))
      csvLines.push(csvRow('Due Date', 'Date', 'Percentage', 'Estimated Amount', 'Currency'))
      payRanges.forEach(r => {
        const [label, date] = deadlineParts(r.triggerType, r.daysBeforeCheckin)
        csvLines.push(csvRow(label, date, `${r.pct}%`, n(body.totalAmount * r.pct / 100), cur))
      })
    }

    if (cfg?.groupPolicies) {
      csvLines.push('', csvRow('GROUP POLICIES'), csvRow(cfg.groupPolicies))
    }

    const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf-8')
    const csvAttachment = {
      filename: `group-inquiry-${body.checkIn}-${body.checkOut}.csv`,
      content: csvBuffer,
      contentType: 'text/csv',
    }

    // ── Pricing delta banner (hotel email only) ───────────────────────────────
    const pricingBanner = (() => {
      if (!cfg || !cfg.pricingPct) return ''
      const pct = cfg.pricingPct
      const isDiscount = cfg.pricingDirection === 'decrease'
      const standardTotal = isDiscount
        ? body.totalAmount / (1 - pct / 100)
        : body.totalAmount / (1 + pct / 100)
      const sign = isDiscount ? '−' : '+'
      const color = isDiscount ? '#065f46' : '#92400e'
      const bg = isDiscount ? '#d1fae5' : '#fef3c7'
      const border = isDiscount ? '#6ee7b7' : '#fcd34d'
      return `<div style="margin-bottom:16px;padding:10px 14px;background:${bg};border-left:4px solid ${border};border-radius:4px">
        <span style="font-size:15px;font-weight:700;color:${color}">${sign}${pct}% vs. standard pricing</span>
        <span style="margin-left:12px;font-size:13px;color:#374151">Standard total: ${fmt(standardTotal)} &nbsp;→&nbsp; Group total: ${fmt(body.totalAmount)}</span>
      </div>`
    })()

    // ── Assemble emails ───────────────────────────────────────────────────────
    const hotelHtml = `
      <div style="font-family:sans-serif;max-width:700px;color:#1f2937">
        <h2 style="color:#1f2937;margin-bottom:4px">New Group Booking Inquiry</h2>
        <p style="margin:0 0 16px;color:#6b7280;font-size:13px">Reply directly to this email to contact the guest.</p>
        ${pricingBanner}
        <p style="margin:4px 0"><strong>Check-in:</strong> ${body.checkIn} &nbsp;&nbsp; <strong>Check-out:</strong> ${body.checkOut}</p>
        <p style="margin:4px 0"><strong>Contact:</strong> ${body.contactName} &lt;${body.contactEmail}&gt;${body.contactPhone ? ` · ${body.contactPhone}` : ''}</p>
        <p style="margin:4px 0"><strong>Nationality:</strong> ${body.nationality}</p>
        ${body.message ? `<p style="margin:4px 0"><strong>Message:</strong> ${body.message}</p>` : ''}
        ${roomsSection}
        ${mealsSection}
        ${meetingSection}
        ${freeRoomsSection}
        ${totalSection}
        ${cancellationSection}
        ${paymentSection}
        ${policiesSection}
      </div>`

    const guestHtml = `
      <div style="font-family:sans-serif;max-width:700px;color:#1f2937">
        <h2 style="color:#1f2937">We've received your group booking request</h2>
        <p>Thank you, ${body.contactName}. Our groups team will review your request and get back to you within 24 hours.</p>
        <p><strong>Check-in:</strong> ${body.checkIn} &nbsp;&nbsp; <strong>Check-out:</strong> ${body.checkOut}</p>
        ${roomsSection}
        ${mealsSection}
        ${meetingSection}
        ${freeRoomsSection}
        ${totalSection}
        ${cancellationSection}
        ${paymentSection}
        ${policiesSection}
        <p style="color:#6b7280;font-size:12px;margin-top:24px">Please quote your enquiry when following up.</p>
      </div>`

    const [hotelResult, guestResult] = await Promise.all([
      sendEmail(prop.organizationId, {
        to: groupEmail,
        subject: `Group Inquiry: ${body.checkIn} → ${body.checkOut} (${body.contactName})`,
        html: hotelHtml,
        replyTo: body.contactEmail,
        attachments: [csvAttachment],
      }),
      sendEmail(prop.organizationId, {
        to: body.contactEmail,
        subject: 'Your group booking request has been received',
        html: guestHtml,
        attachments: [csvAttachment],
      }),
    ])

    if (!hotelResult.ok) {
      return reply.status(500).send({ error: `Failed to send inquiry: ${hotelResult.error}` })
    }

    return reply.send({ ok: true, guestEmailSent: guestResult.ok })
  })
}
