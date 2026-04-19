import type { FastifyInstance } from 'fastify'
import { getOrgSettings, updateOrgSettings, setPropertyMode, setShowCitySelector, setShowDemoProperty, setRateProvider } from '../services/org.service.js'
import type { PropertyMode } from '../services/org.service.js'
import { listProperties, listAllProperties, makeDemoRecord, addProperty, PropertyConflictError, setDefaultProperty, removeProperty, setPropertyActive, setPropertyHGCredentials, getPropertyUsers, setPropertyUsers } from '../services/property-registry.service.js'
import { runImport } from '../services/import.service.js'
import { parseColumnFromBuffer } from '../utils/file-parser.js'
import { getHGCredentials } from '../services/credentials.service.js'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { prisma } from '../db/client.js'
import { listOrgNavItems, createOrgNavItem, updateOrgNavItem, deleteOrgNavItem } from '../services/org-nav.service.js'
import type { CreateOrgNavItemRequest, UpdateOrgNavItemRequest } from '@ibe/shared'

export async function adminRoutes(fastify: FastifyInstance) {
  // ── Org Settings ─────────────────────────────────────────────────────────────

  fastify.get('/admin/org', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const [org, settings, effective] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { hyperGuestOrgId: true } }),
      getOrgSettings(organizationId),
      getHGCredentials(organizationId),
    ])
    return reply.send({
      hyperGuestOrgId: org?.hyperGuestOrgId ?? null,
      hyperGuestBearerToken: settings.hyperGuestBearerToken
        ? `****${settings.hyperGuestBearerToken.slice(-4)}`
        : null,
      hyperGuestBearerTokenSet: !!settings.hyperGuestBearerToken,
      hyperGuestStaticDomain: settings.hyperGuestStaticDomain,
      hyperGuestSearchDomain: settings.hyperGuestSearchDomain,
      hyperGuestBookingDomain: settings.hyperGuestBookingDomain,
      effectiveBearerTokenSet: !!settings.hyperGuestBearerToken,
      effectiveStaticDomain: effective.staticDomain,
      effectiveSearchDomain: effective.searchDomain,
      effectiveBookingDomain: effective.bookingDomain,
      envFallback: {
        staticDomain: !settings.hyperGuestStaticDomain && !!env.HYPERGUEST_STATIC_DOMAIN,
        searchDomain: !settings.hyperGuestSearchDomain && !!env.HYPERGUEST_SEARCH_DOMAIN,
        bookingDomain: !settings.hyperGuestBookingDomain && !!env.HYPERGUEST_BOOKING_DOMAIN,
      },
      rateProvider: settings.rateProvider,
      defaultPropertyId: env.NEXT_PUBLIC_DEFAULT_HOTEL_ID ?? Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID']),
      webDomain: settings.webDomain,
      tlsCert: settings.tlsCert,
      tlsCertSet: !!settings.tlsCert,
      tlsKeySet: !!settings.tlsKey,
    })
  })

  fastify.put('/admin/org', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const body = request.body as {
      hyperGuestOrgId?: string
      hyperGuestBearerToken?: string
      hyperGuestStaticDomain?: string
      hyperGuestSearchDomain?: string
      hyperGuestBookingDomain?: string
      webDomain?: string
      tlsCert?: string
      tlsKey?: string
    }

    const updates: Promise<unknown>[] = []

    if (body.hyperGuestOrgId !== undefined) {
      updates.push(
        prisma.organization.update({
          where: { id: organizationId },
          data: { hyperGuestOrgId: body.hyperGuestOrgId.trim() || null },
        })
      )
    }

    const data: Record<string, string | null> = {}
    if (body.hyperGuestStaticDomain !== undefined) data['hyperGuestStaticDomain'] = body.hyperGuestStaticDomain || null
    if (body.hyperGuestSearchDomain !== undefined) data['hyperGuestSearchDomain'] = body.hyperGuestSearchDomain || null
    if (body.hyperGuestBookingDomain !== undefined) data['hyperGuestBookingDomain'] = body.hyperGuestBookingDomain || null
    if (body.webDomain !== undefined) data['webDomain'] = body.webDomain || null
    if (body.tlsCert !== undefined) data['tlsCert'] = body.tlsCert || null
    if (body.tlsKey !== undefined) data['tlsKey'] = body.tlsKey || null
    if (body.hyperGuestBearerToken !== undefined && !body.hyperGuestBearerToken.startsWith('****')) {
      data['hyperGuestBearerToken'] = body.hyperGuestBearerToken || null
    }
    if (Object.keys(data).length > 0) updates.push(updateOrgSettings(organizationId, data))

    await Promise.all(updates)
    return reply.send({ ok: true })
  })

  // ── Properties ────────────────────────────────────────────────────────────────

  fastify.get('/admin/properties', async (request, reply) => {
    const organizationId = request.admin.organizationId
    if (!organizationId) {
      // Super admin with no org — use /admin/super/properties instead
      return reply.send({ mode: 'single', showCitySelector: false, showDemoProperty: false, properties: [] })
    }
    const isSuper = request.admin.role === 'super'
    const settings = await getOrgSettings(organizationId)
    const showDemo = isSuper || settings.showDemoProperty
    const properties = await listProperties(organizationId, showDemo)
    return reply.send({ mode: settings.propertyMode, showCitySelector: settings.showCitySelector, showDemoProperty: settings.showDemoProperty, properties })
  })

  fastify.get('/admin/super/properties', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const real = await listAllProperties()
    return reply.send({ properties: [...real, makeDemoRecord()] })
  })

  fastify.put('/admin/properties/mode', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const { mode } = request.body as { mode: string }
    if (mode !== 'single' && mode !== 'multi') {
      return reply.status(400).send({ error: 'mode must be "single" or "multi"', code: 'IBE.VALIDATION.001' })
    }
    await setPropertyMode(organizationId, mode as PropertyMode)
    return reply.send({ ok: true, mode })
  })

  fastify.put('/admin/properties/city-selector', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const { enabled } = request.body as { enabled: boolean }
    await setShowCitySelector(organizationId, !!enabled)
    return reply.send({ ok: true, enabled: !!enabled })
  })

  fastify.put('/admin/properties/demo', async (request, reply) => {
    const organizationId = request.admin.organizationId
    if (!organizationId) return reply.status(400).send({ error: 'No organization context' })
    const { enabled } = request.body as { enabled: boolean }
    await setShowDemoProperty(organizationId, !!enabled)
    return reply.send({ ok: true, enabled: !!enabled })
  })

  fastify.put('/admin/properties/:id/active', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { active } = request.body as { active: boolean }
    await setPropertyActive(request.admin.organizationId, id, !!active)
    return reply.send({ ok: true, active: !!active })
  })

  // ── Currency ──────────────────────────────────────────────────────────────────

  fastify.put('/admin/currency/rate-provider', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const { provider } = request.body as { provider: string }
    await setRateProvider(organizationId, provider)
    return reply.send({ ok: true, provider })
  })

  fastify.post('/admin/properties', async (request, reply) => {
    const { propertyId, organizationId: bodyOrgId } = request.body as { propertyId: number; organizationId?: number }
    const organizationId = request.admin.organizationId ?? bodyOrgId
    if (!organizationId) return reply.status(400).send({ error: 'No organization context' })
    if (!propertyId || isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: 'IBE.VALIDATION.001' })
    }
    try {
      const record = await addProperty(organizationId, propertyId)
      return reply.status(201).send(record)
    } catch (err) {
      if (err instanceof PropertyConflictError) {
        return reply.status(409).send({ error: err.message, code: 'IBE.PROPERTY.CONFLICT' })
      }
      throw err
    }
  })

  fastify.post('/admin/properties/import', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded', code: 'IBE.VALIDATION.001' })
    }
    const allowed = ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'text/plain']
    if (!allowed.includes(file.mimetype) && !file.filename.match(/\.(csv|xlsx|xls)$/i)) {
      return reply.status(400).send({ error: 'File must be CSV or Excel (.csv, .xlsx, .xls)', code: 'IBE.VALIDATION.001' })
    }
    const buffer = await file.toBuffer()
    const values = parseColumnFromBuffer(buffer, file.filename)
    if (values.length === 0) {
      return reply.status(400).send({ error: 'No property IDs found in file', code: 'IBE.VALIDATION.001' })
    }
    const summary = await runImport(values, async (raw) => {
      const id = parseInt(raw, 10)
      if (isNaN(id) || id <= 0) throw new Error(`"${raw}" is not a valid property ID`)
      await addProperty(organizationId, id)
    })
    return reply.status(200).send(summary)
  })

  fastify.put('/admin/properties/:id/default', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const id = parseInt((request.params as { id: string }).id, 10)
    await setDefaultProperty(organizationId, id)
    return reply.send({ ok: true })
  })

  fastify.delete('/admin/properties/:id', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const id = parseInt((request.params as { id: string }).id, 10)
    await removeProperty(organizationId, id)
    return reply.send({ ok: true })
  })

  fastify.put('/admin/properties/:id/hg-credentials', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const id = parseInt((request.params as { id: string }).id, 10)
    const { bearerToken, staticDomain, searchDomain, bookingDomain } = request.body as {
      bearerToken?: string
      staticDomain?: string
      searchDomain?: string
      bookingDomain?: string
    }
    await setPropertyHGCredentials(organizationId, id, {
      bearerToken: bearerToken || null,
      staticDomain: staticDomain || null,
      searchDomain: searchDomain || null,
      bookingDomain: bookingDomain || null,
    })
    const { invalidateCredentialsCache } = await import('../services/credentials.service.js')
    invalidateCredentialsCache(organizationId)
    return reply.send({ ok: true })
  })

  fastify.put('/admin/properties/:id/subdomain', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const id = parseInt((request.params as { id: string }).id, 10)
    const { subdomain } = request.body as { subdomain?: string }
    const value = subdomain?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null
    await prisma.property.update({
      where: { id, organizationId },
      data: { subdomain: value },
    })
    return reply.send({ ok: true, subdomain: value })
  })

  // ── Org Nav Items ─────────────────────────────────────────────────────────────

  fastify.get('/admin/org-nav-items', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const { section } = request.query as { section?: string }
    const items = await listOrgNavItems(organizationId, section)
    return reply.send(items)
  })

  fastify.post('/admin/org-nav-items', async (request, reply) => {
    const organizationId = request.admin.organizationId!
    const data = request.body as CreateOrgNavItemRequest
    const item = await createOrgNavItem(organizationId, data)
    return reply.status(201).send(item)
  })

  fastify.put('/admin/org-nav-items/reorder', async (request, reply) => {
    const { ids } = request.body as { ids: string[] }
    await Promise.all(ids.map((id, order) => updateOrgNavItem(id, { order })))
    return reply.send({ ok: true })
  })

  fastify.put('/admin/org-nav-items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = request.body as UpdateOrgNavItemRequest
    const item = await updateOrgNavItem(id, data)
    return reply.send(item)
  })

  fastify.delete('/admin/org-nav-items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteOrgNavItem(id)
    return reply.send({ ok: true })
  })

  fastify.get('/admin/properties/:id/users', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const users = await getPropertyUsers(id, request.admin.organizationId)
    return reply.send(users)
  })

  fastify.put('/admin/properties/:id/users', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { userIds } = request.body as { userIds: number[] }
    if (!Array.isArray(userIds)) return reply.status(400).send({ error: 'userIds must be an array' })
    await setPropertyUsers(id, request.admin.organizationId, userIds)
    return reply.send({ ok: true })
  })
}
