import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  listIncentiveItems,
  createIncentiveItem,
  updateIncentiveItem,
  deleteIncentiveItem,
  setChainItemOverride,
  setPropertyItemOverride,
  listIncentivePackages,
  createIncentivePackage,
  updateIncentivePackage,
  deleteIncentivePackage,
  getIncentiveSlots,
  setIncentiveSlot,
  getIncentiveChainConfig,
  setIncentiveChainEnabled,
  resolveIncentiveSlotsForProperty,
  resolveIncentiveSlotsForChain,
} from '../services/incentive.service.js'
import {
  listIncentiveItemTranslations,
  autoTranslateIncentiveItems,
  upsertTranslation,
  translateDynamicString,
} from '../services/translation.service.js'

// Resolve orgId for the request:
// - Super admin with ?orgId=X → chain level for org X
// - Super admin with no orgId → system level (null)
// - Regular admin → their own org
function getAdminOrgId(request: FastifyRequest): number | null {
  if (request.admin.role === 'super') {
    const raw = (request.query as Record<string, string>).orgId
    return raw ? Number(raw) : null
  }
  return request.admin.organizationId
}

function getAdminOrgIdFromBody(request: FastifyRequest): number | null {
  if (request.admin.role === 'super') {
    const raw = (request.body as Record<string, unknown>).orgId
    return raw != null ? Number(raw) : null
  }
  return request.admin.organizationId
}

// ── Admin routes ──────────────────────────────────────────────────────────────

export async function incentiveAdminRoutes(fastify: FastifyInstance) {
  // Items
  fastify.get('/admin/incentives/items', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const q = request.query as Record<string, string>
    const hotelView = q.hotelView === 'true'
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    return reply.send(await listIncentiveItems(orgId, hotelView, propertyId))
  })

  fastify.post('/admin/incentives/items', async (request, reply) => {
    const orgId = getAdminOrgIdFromBody(request)
    if (orgId === null && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can create system-level items' })
    }
    const { text, sortOrder, visibleToChains, propertyId, visibleToHotels } = request.body as {
      text: string; sortOrder?: number; visibleToChains?: boolean; propertyId?: number; visibleToHotels?: boolean
    }
    if (!text?.trim()) return reply.status(400).send({ error: 'text required' })
    return reply.status(201).send(
      await createIncentiveItem(orgId, text.trim(), sortOrder, visibleToChains ?? false, propertyId, visibleToHotels ?? false)
    )
  })

  fastify.put('/admin/incentives/items/:id', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const id = Number((request.params as { id: string }).id)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    const { text, isActive, sortOrder, visibleToChains, visibleToHotels } = request.body as {
      text?: string; isActive?: boolean; sortOrder?: number; visibleToChains?: boolean; visibleToHotels?: boolean
    }
    const patch: { text?: string; isActive?: boolean; sortOrder?: number; visibleToChains?: boolean; visibleToHotels?: boolean } = {}
    if (text !== undefined) patch.text = text.trim()
    if (isActive !== undefined) patch.isActive = isActive
    if (sortOrder !== undefined) patch.sortOrder = sortOrder
    if (visibleToChains !== undefined) {
      if (orgId !== null) return reply.status(403).send({ error: 'Only super admins can set visibility' })
      patch.visibleToChains = visibleToChains
    }
    if (visibleToHotels !== undefined) patch.visibleToHotels = visibleToHotels
    try {
      return reply.send(await updateIncentiveItem(id, orgId, patch, propertyId))
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }
  })

  fastify.delete('/admin/incentives/items/:id', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const id = Number((request.params as { id: string }).id)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    try {
      await deleteIncentiveItem(id, orgId, propertyId)
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }
  })

  // Packages
  fastify.get('/admin/incentives/packages', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const q = request.query as Record<string, string>
    const hotelView = q.hotelView === 'true'
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    return reply.send(await listIncentivePackages(orgId, hotelView, propertyId))
  })

  fastify.post('/admin/incentives/packages', async (request, reply) => {
    const orgId = getAdminOrgIdFromBody(request)
    if (orgId === null && request.admin.role !== 'super') {
      return reply.status(403).send({ error: 'Only super admins can create system-level packages' })
    }
    const body = request.body as {
      name: string; isActive?: boolean; fontSize?: string; visibleToChains?: boolean; visibleToHotels?: boolean; itemIds?: number[]
      propertyId?: number
    }
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name required' })
    if (body.visibleToChains === true && orgId !== null) {
      return reply.status(403).send({ error: 'Only super admins can set visibleToChains' })
    }
    return reply.status(201).send(await createIncentivePackage(orgId, { ...body, name: body.name.trim() }))
  })

  fastify.put('/admin/incentives/packages/:id', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const id = Number((request.params as { id: string }).id)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    const body = request.body as {
      name?: string; isActive?: boolean; fontSize?: string; visibleToChains?: boolean; visibleToHotels?: boolean; itemIds?: number[]
    }
    if (body.visibleToChains === true && orgId !== null) {
      return reply.status(403).send({ error: 'Only super admins can set visibleToChains' })
    }
    try {
      return reply.send(await updateIncentivePackage(id, orgId, body, propertyId))
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }
  })

  fastify.delete('/admin/incentives/packages/:id', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const id = Number((request.params as { id: string }).id)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    try {
      await deleteIncentivePackage(id, orgId, propertyId)
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }
  })

  // Slot assignments
  fastify.get('/admin/incentives/slots', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    return reply.send(await getIncentiveSlots(orgId, propertyId))
  })

  fastify.put('/admin/incentives/slots/:slot', async (request, reply) => {
    const slot = (request.params as { slot: string }).slot
    const valid = ['chain_page', 'hotel_page', 'room_banner', 'room_results']
    if (!valid.includes(slot)) return reply.status(400).send({ error: 'Invalid slot' })

    const orgId = getAdminOrgIdFromBody(request)
    const body = request.body as { packageId?: number | null; propertyId?: number }
    const propertyId = body.propertyId

    // packageId: number = assign, null = disable, undefined/missing = revert to inherit
    await setIncentiveSlot(slot, orgId, propertyId, body.packageId)
    return reply.send({ ok: true })
  })

  // Chain-level item override (disable a system item for this chain)
  fastify.put('/admin/incentives/items/:id/chain-override', async (request, reply) => {
    const orgId = getAdminOrgIdFromBody(request)
    if (orgId === null) return reply.status(400).send({ error: 'orgId required' })
    const itemId = Number((request.params as { id: string }).id)
    const { disabled } = request.body as { disabled: boolean }
    if (disabled === undefined) return reply.status(400).send({ error: 'disabled required' })
    await setChainItemOverride(orgId, itemId, disabled)
    return reply.send({ ok: true })
  })

  // Property-level item override (hotel enables/disables a chain item)
  fastify.put('/admin/incentives/items/:id/property-override', async (request, reply) => {
    const { propertyId, disabled } = request.body as { propertyId: number; disabled: boolean }
    if (!propertyId) return reply.status(400).send({ error: 'propertyId required' })
    if (disabled === undefined) return reply.status(400).send({ error: 'disabled required' })
    const itemId = Number((request.params as { id: string }).id)
    await setPropertyItemOverride(propertyId, itemId, disabled)
    return reply.send({ ok: true })
  })

  // Chain-level enable toggle
  fastify.get('/admin/incentives/chain-config', async (request, reply) => {
    const orgId = getAdminOrgId(request)
    if (orgId === null) return reply.status(400).send({ error: 'orgId required for chain config' })
    return reply.send(await getIncentiveChainConfig(orgId))
  })

  fastify.put('/admin/incentives/chain-config', async (request, reply) => {
    const orgId = getAdminOrgIdFromBody(request) ?? getAdminOrgId(request)
    if (orgId === null) return reply.status(400).send({ error: 'orgId required for chain config' })
    const { incentivesEnabled } = request.body as { incentivesEnabled: boolean }
    if (incentivesEnabled === undefined) return reply.status(400).send({ error: 'incentivesEnabled required' })
    return reply.send(await setIncentiveChainEnabled(orgId, incentivesEnabled))
  })

  // Incentive item translations
  fastify.get('/admin/incentives/translations/:locale', async (request, reply) => {
    const { locale } = request.params as { locale: string }
    const orgId = getAdminOrgId(request)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined
    return reply.send(await listIncentiveItemTranslations(locale, orgId, propertyId))
  })

  fastify.put('/admin/incentives/translations/:locale/:itemId', async (request, reply) => {
    const { locale, itemId } = request.params as { locale: string; itemId: string }
    const { value } = request.body as { value: string }
    if (typeof value !== 'string') return reply.status(400).send({ error: 'value required' })
    await upsertTranslation(locale, 'incentive_items', itemId, value)
    return reply.send({ ok: true })
  })

  fastify.post('/admin/incentives/translations/:locale/:itemId/ai-translate', async (request, reply) => {
    const { locale, itemId } = request.params as { locale: string; itemId: string }
    const { text } = request.body as { text: string }
    if (!text?.trim()) return reply.status(400).send({ error: 'text required' })
    try {
      const value = await translateDynamicString(locale, text.trim(), 'incentive_items', itemId)
      return reply.send({ value })
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Translation failed' })
    }
  })

  fastify.post('/admin/incentives/translations/:locale/auto-translate', async (request, reply) => {
    const { locale } = request.params as { locale: string }
    const orgId = getAdminOrgId(request)
    const q = request.query as Record<string, string>
    const propertyId = q.propertyId ? Number(q.propertyId) : undefined

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders()

    try {
      await autoTranslateIncentiveItems(
        locale, orgId, propertyId,
        (event) => { reply.raw.write(`data: ${JSON.stringify(event)}\n\n`) },
      )
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Translation failed' })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })
}

// ── Public routes ─────────────────────────────────────────────────────────────

export async function incentivePublicRoutes(fastify: FastifyInstance) {
  fastify.get('/incentives/property/:propertyId', async (request, reply) => {
    const propertyId = Number((request.params as { propertyId: string }).propertyId)
    if (!propertyId) return reply.status(400).send({ error: 'Invalid propertyId' })
    const locale = (request.query as { locale?: string }).locale ?? 'en'
    reply.header('Cache-Control', 'public, max-age=30')
    return reply.send(await resolveIncentiveSlotsForProperty(propertyId, locale))
  })

  fastify.get('/incentives/chain', async (request, reply) => {
    const query = request.query as { orgId?: string; locale?: string }
    const orgId = query.orgId ? Number(query.orgId) : null
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const locale = query.locale ?? 'en'
    reply.header('Cache-Control', 'public, max-age=30')
    return reply.send(await resolveIncentiveSlotsForChain(orgId, locale))
  })
}
