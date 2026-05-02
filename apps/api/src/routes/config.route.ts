import type { FastifyInstance } from 'fastify'
import { IBE_ERROR_VALIDATION } from '@ibe/shared'
import { getHotelDesignConfig, getOrgDesignConfig, upsertHotelDesignConfig, getOrgDesignDefaults, upsertOrgDesignDefaults, getPropertyDesignAdmin, getSystemDesignDefaults, upsertSystemDesignDefaults, loadSystemDesign } from '../services/config.service.js'
import { getOrgIdForProperty, listProperties } from '../services/property-registry.service.js'
import { resolveSellerOrg } from '../services/b2b-auth.service.js'
import { getOrgSettings } from '../services/org.service.js'
import { getEffectiveOffersSettings } from '../services/offers.service.js'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { prisma } from '../db/client.js'

function safeParseJsonIds(value: string | null | undefined): number[] {
  try { return JSON.parse(value ?? '[]') as number[] } catch { return [] }
}

function safeParseJsonImages(value: string | null | undefined): Array<{ id: number; url: string; description: string; priority: number }> {
  try { return JSON.parse(value ?? '[]') as Array<{ id: number; url: string; description: string; priority: number }> } catch { return [] }
}

export async function configRoutes(fastify: FastifyInstance) {
  // GET /offers/constraints/:propertyId — public: effective min/max nights & rooms for search UI
  fastify.get('/offers/constraints/:propertyId', async (request, reply) => {
    const { propertyId: rawId } = request.params as { propertyId: string }
    const propertyId = parseInt(rawId, 10)
    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID' })
    }
    const s = await getEffectiveOffersSettings(propertyId)
    void reply.header('Cache-Control', 'public, max-age=30')
    return reply.send({ minNights: s.minNights, maxNights: s.maxNights, minRooms: s.minRooms, maxRooms: s.maxRooms, bookingMode: s.bookingMode, multiRoomLimitBy: s.multiRoomLimitBy })
  })

  // GET /config/resolve?host=grandhotel.hyperguest.net — resolves a hostname to a tenant
  fastify.get('/config/resolve', async (request, reply) => {
    const { host } = request.query as { host?: string }
    if (!host) return reply.status(400).send({ error: 'host is required' })

    const PLATFORM_HOST = 'hyperguest.net'

    if (host.endsWith(`.${PLATFORM_HOST}`)) {
      const subdomain = host.slice(0, -(PLATFORM_HOST.length + 1))
      const property = await prisma.property.findFirst({
        where: { subdomain, isActive: true, deletedAt: null },
      })
      if (property) {
        return reply.send({ type: 'property', propertyId: property.propertyId, orgId: property.organizationId })
      }
      const org = await prisma.organization.findUnique({ where: { slug: subdomain } })
      if (org) return reply.send({ type: 'org', orgId: org.id })
    } else {
      const normalized = host.replace(/^https?:\/\//, '')
      const orgSettings = await prisma.orgSettings.findFirst({
        where: { webDomain: { in: [`https://${normalized}`, `http://${normalized}`] } },
      })
      if (orgSettings) return reply.send({ type: 'org', orgId: orgSettings.organizationId })
    }

    return reply.status(404).send({ error: 'No tenant found for this host' })
  })

  // GET /config/property/:id — frontend fetches this on every page load (cached)
  fastify.get('/config/property/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)
    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: IBE_ERROR_VALIDATION })
    }
    const config = await getHotelDesignConfig(propertyId)
    void reply.header('Cache-Control', 'public, max-age=30, s-maxage=30')
    return reply.send(config)
  })

  // GET /config/org-resolve/:hyperGuestOrgId — resolve hyperGuestOrgId → internal org DB id
  fastify.get('/config/org-resolve/:hyperGuestOrgId', async (request, reply) => {
    const { hyperGuestOrgId } = request.params as { hyperGuestOrgId: string }
    const org = await prisma.organization.findUnique({ where: { hyperGuestOrgId }, select: { id: true } })
    if (!org) return reply.status(404).send({ error: 'Organization not found', code: 'IBE.ORG.001' })
    void reply.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    return reply.send({ id: org.id })
  })

  // GET /config/seller/:slug — public: seller branding for B2B login page
  // Individual hotel subdomain → property-level logo; org slug → chain-level logo
  fastify.get('/config/seller/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const property = await prisma.property.findFirst({
      where: { subdomain: slug, deletedAt: null },
      select: { propertyId: true },
    })
    void reply.header('Cache-Control', 'public, max-age=60, s-maxage=300')
    if (property) {
      const config = await getHotelDesignConfig(property.propertyId)
      return reply.send({ logoUrl: config.logoUrl, displayName: config.displayName })
    }
    const orgId = await resolveSellerOrg(slug)
    if (!orgId) return reply.status(404).send({ error: 'Seller not found' })
    const config = await getOrgDesignConfig(orgId)
    return reply.send({ logoUrl: config.logoUrl, displayName: config.displayName })
  })

  // GET /config/system-meta — public: tab title + favicon for the admin layout
  fastify.get('/config/system-meta', async (request, reply) => {
    const cfg = await getSystemDesignDefaults()
    void reply.header('Cache-Control', 'public, max-age=60, s-maxage=300')
    return reply.send({
      displayName: cfg.displayName ?? null,
      tabTitle: cfg.tabTitle ?? null,
      faviconUrl: cfg.faviconUrl ?? null,
      logoUrl: cfg.logoUrl ?? null,
    })
  })

  // GET /config/logo/:orgId — public: serve org logo as image/png (decodes data URIs for external consumers like Claude.ai)
  fastify.get('/config/logo/:orgId', async (request, reply) => {
    const { orgId: rawId } = request.params as { orgId: string }
    const orgId = parseInt(rawId, 10)
    if (isNaN(orgId) || orgId <= 0) return reply.status(400).send({ error: 'Invalid org ID' })
    const config = await getOrgDesignConfig(orgId)
    const logoUrl = config.logoUrl
    if (!logoUrl) return reply.status(404).send({ error: 'No logo' })
    void reply.header('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    if (logoUrl.startsWith('data:')) {
      const parts = logoUrl.split(',')
      const mimeMatch = parts[0]?.match(/data:([^;]+)/)
      const mime = mimeMatch?.[1] ?? 'image/png'
      const buf = Buffer.from(parts[1] ?? '', 'base64')
      void reply.header('Content-Type', mime)
      return reply.send(buf)
    }
    return reply.redirect(302, logoUrl)
  })

  // GET /config/org/:orgId — public org-level design config for chain page
  fastify.get('/config/org/:orgId', async (request, reply) => {
    const { orgId: rawId } = request.params as { orgId: string }
    const orgId = parseInt(rawId, 10)
    if (isNaN(orgId) || orgId <= 0) {
      return reply.status(400).send({ error: 'Invalid org ID', code: IBE_ERROR_VALIDATION })
    }
    const config = await getOrgDesignConfig(orgId)
    void reply.header('Cache-Control', 'public, max-age=30, s-maxage=30')
    return reply.send(config)
  })

  // GET /config/org-images/:orgId — public chain-featured image URLs for chain page carousel/quilt
  fastify.get('/config/org-images/:orgId', async (request, reply) => {
    const { orgId: rawId } = request.params as { orgId: string }
    const orgId = parseInt(rawId, 10)
    if (isNaN(orgId) || orgId <= 0) {
      return reply.status(400).send({ error: 'Invalid org ID', code: IBE_ERROR_VALIDATION })
    }

    const [orgDefaults, properties] = await Promise.all([
      prisma.orgDesignDefaults.findUnique({ where: { organizationId: orgId }, select: { chainExcludedPropertyImageIds: true } }),
      prisma.property.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { propertyId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    if (properties.length === 0) {
      void reply.header('Cache-Control', 'public, max-age=60, s-maxage=300')
      return reply.send({ images: [] })
    }

    const excludedIds = new Set(safeParseJsonIds(orgDefaults?.chainExcludedPropertyImageIds))
    const propertyIds = properties.map(p => p.propertyId)
    const configs = await prisma.hotelConfig.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { chainFeaturedImagesJson: true },
    })

    const images: string[] = []
    for (const config of configs) {
      const featured = safeParseJsonImages(config.chainFeaturedImagesJson)
      for (const img of featured) {
        if (!excludedIds.has(img.id)) images.push(img.url)
      }
    }

    void reply.header('Cache-Control', 'public, max-age=60, s-maxage=300')
    return reply.send({ images })
  })

  // GET /config/properties?propertyId=X or ?orgId=X — public property list for IBE homepage
  fastify.get('/config/properties', async (request, reply) => {
    const { propertyId: rawPropertyId, orgId: rawOrgId } = request.query as { propertyId?: string; orgId?: string }

    let orgId: number | null = null
    if (rawOrgId) {
      orgId = parseInt(rawOrgId, 10)
      if (isNaN(orgId) || orgId <= 0) {
        return reply.status(400).send({ error: 'Invalid orgId', code: IBE_ERROR_VALIDATION })
      }
    } else {
      const propertyId = parseInt(rawPropertyId ?? '', 10)
      if (isNaN(propertyId) || propertyId <= 0) {
        return reply.status(400).send({ error: 'propertyId or orgId is required', code: IBE_ERROR_VALIDATION })
      }
      orgId = await getOrgIdForProperty(propertyId) ?? null
    }

    if (!orgId) {
      return reply.send({ mode: 'single', showCitySelector: false, showDemoProperty: false, properties: [] })
    }
    const [settings, properties] = await Promise.all([
      getOrgSettings(orgId),
      listProperties(orgId, false),
    ])
    void reply.header('Cache-Control', 'public, max-age=60, s-maxage=300')
    return reply.send({
      orgId,
      mode: settings.propertyMode,
      showCitySelector: settings.showCitySelector,
      showDemoProperty: settings.showDemoProperty,
      enabledModels: settings.enabledModels,
      properties,
    })
  })

  // PUT /config/property/:id — admin saves property-level design overrides
  fastify.put('/config/property/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const propertyId = parseInt(id, 10)
    if (isNaN(propertyId) || propertyId <= 0) {
      return reply.status(400).send({ error: 'Invalid property ID', code: IBE_ERROR_VALIDATION })
    }
    const body = request.body as Record<string, unknown>
    const config = await upsertHotelDesignConfig(propertyId, body)
    return reply.send(config)
  })

  // GET /admin/design/system — get system-level design defaults (super admin only)
  fastify.get('/admin/design/system', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await getSystemDesignDefaults())
  })

  // PUT /admin/design/system — update system-level design defaults (super admin only)
  fastify.put('/admin/design/system', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await upsertSystemDesignDefaults(request.body as Record<string, unknown>))
  })

  // GET /admin/design/global — get org-level design defaults + system defaults for inheritance display
  fastify.get('/admin/design/global', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { orgId?: string }
    const orgId = request.admin.role === 'super' && query.orgId
      ? parseInt(query.orgId, 10)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const [overrides, systemDefaults] = await Promise.all([getOrgDesignDefaults(orgId), loadSystemDesign()])
    return reply.send({ overrides, systemDefaults })
  })

  // GET /admin/design/property/:propertyId — raw overrides + org defaults for a property
  fastify.get('/admin/design/property/:propertyId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const id = parseInt((request.params as { propertyId: string }).propertyId, 10)
    if (isNaN(id) || id <= 0) return reply.status(400).send({ error: 'Invalid property ID' })
    const result = await getPropertyDesignAdmin(id)
    return reply.send({ propertyId: id, ...result })
  })

  // PUT /admin/design/global — update org-level design defaults
  fastify.put('/admin/design/global', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { orgId?: string }
    const orgId = request.admin.role === 'super' && query.orgId
      ? parseInt(query.orgId, 10)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })
    const body = request.body as Record<string, unknown>
    try {
      const [overrides, systemDefaults] = await Promise.all([upsertOrgDesignDefaults(orgId, body), loadSystemDesign()])
      return reply.send({ overrides, systemDefaults })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('reach database server') || msg.includes('P1001') || msg.includes('Connection timed out')) {
        return reply.status(503).send({ error: 'Database temporarily unavailable, please retry' })
      }
      throw err
    }
  })

  // GET /admin/design/chain-images — all chain-featured images for every property in the org (single round-trip)
  fastify.get('/admin/design/chain-images', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { orgId?: string }
    const orgId = request.admin.role === 'super' && query.orgId
      ? parseInt(query.orgId, 10)
      : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'No organization context' })

    // 1. Fetch all non-demo properties + their HotelConfig in one DB query
    const properties = await prisma.property.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { propertyId: true, name: true },
      orderBy: { createdAt: 'asc' },
    })

    if (properties.length === 0) return reply.send({ properties: [] })

    const propertyIds = properties.map(p => p.propertyId)
    const configs = await prisma.hotelConfig.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { propertyId: true, chainFeaturedImageIds: true, chainFeaturedImagesJson: true },
    })
    const configMap = new Map(configs.map(c => [c.propertyId, c]))

    // 2. HyperGuest calls run in parallel; backfills run sequentially after to avoid pool exhaustion
    const toBackfill: Array<{ propertyId: number; images: string }> = []

    const results = await Promise.all(
      properties.map(async prop => {
        const config = configMap.get(prop.propertyId)
        const featuredIds = safeParseJsonIds(config?.chainFeaturedImageIds)
        if (featuredIds.length === 0) return null

        // Happy path: images already stored in DB — zero HyperGuest calls
        const storedImages = safeParseJsonImages(config?.chainFeaturedImagesJson)
        if (storedImages.length > 0) {
          return { propertyId: prop.propertyId, name: prop.name ?? `Property ${prop.propertyId}`, images: storedImages }
        }

        // Cold path: fetch from HyperGuest; queue backfill for after all calls complete
        try {
          const staticData = await fetchPropertyStatic(prop.propertyId)
          const featuredSet = new Set(featuredIds)
          const images = staticData.images
            .filter(img => featuredSet.has(img.id))
            .sort((a, b) => a.priority - b.priority)
            .map(img => ({ id: img.id, url: img.uri, description: img.description, priority: img.priority }))
          if (images.length === 0) return null
          toBackfill.push({ propertyId: prop.propertyId, images: JSON.stringify(images) })
          return { propertyId: prop.propertyId, name: prop.name ?? `Property ${prop.propertyId}`, images }
        } catch {
          return null
        }
      })
    )

    // Sequential backfill: one connection at a time, won't exhaust the pool
    for (const { propertyId, images } of toBackfill) {
      try {
        await prisma.hotelConfig.update({ where: { propertyId }, data: { chainFeaturedImagesJson: images } })
      } catch {
        // non-critical: will retry on next load
      }
    }

    return reply.send({ properties: results.filter(Boolean) })
  })
}
