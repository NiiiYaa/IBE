import type { FastifyInstance } from 'fastify'
import {
  getSystemCompSetConfig,
  upsertSystemCompSetConfig,
  getAdminSearchParams,
  createSearchParam,
  updateSearchParam,
  deleteSearchParam,
  updateSearchParamActive,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getRoomMappings,
  replaceRoomMappings,
  autoMapRooms,
} from '../services/compset.service.js'
import { runPropertyCompSet, runSingleCompetitor } from '../services/compset-collect.service.js'
import { getRunStatus, setRunStatus, getCompetitorRunStatus, setCompetitorRunStatus } from '../services/compset-run-status.js'
import { prisma } from '../db/client.js'

export async function compsetRoutes(fastify: FastifyInstance) {

  // GET system config (super only)
  fastify.get('/admin/intelligence/compset/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await getSystemCompSetConfig())
  })

  // PUT system config (super only)
  fastify.put('/admin/intelligence/compset/system-config', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Super admin only' })
    return reply.send(await upsertSystemCompSetConfig(request.body as Record<string, unknown>))
  })

  // GET search params (admin view: own + inherited rows for propertyId, or scoped for orgId/system)
  fastify.get('/admin/intelligence/compset/search-params', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    const rawOrgId = query.orgId ? parseInt(query.orgId, 10) : undefined

    if (propertyId) {
      return reply.send(await getAdminSearchParams({ propertyId }))
    }

    const orgId = request.admin.role === 'super'
      ? (rawOrgId ?? request.admin.organizationId)
      : request.admin.organizationId

    if (request.admin.role === 'super' && !orgId) {
      return reply.send(await getAdminSearchParams({}))
    }

    return reply.send(await getAdminSearchParams({ orgId: orgId ?? null }))
  })

  // POST search param
  fastify.post('/admin/intelligence/compset/search-params', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const rawOrgId = (body.orgId as number | undefined) ?? null
    const rawPropertyId = (body.propertyId as number | undefined) ?? null

    const orgId = request.admin.role === 'super' ? rawOrgId : (request.admin.organizationId ?? null)
    const propertyId = rawPropertyId

    const data: Parameters<typeof createSearchParam>[1] = {
      offsetDays: body.offsetDays as number,
      nights: body.nights as number,
      adults: body.adults as number,
      children: (body.children as number | undefined) ?? 0,
      childAges: (body.childAges as number[] | undefined) ?? [],
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder as number }),
    }
    const result = await createSearchParam({ orgId, propertyId }, data)
    return reply.status(201).send(result)
  })

  // PUT search param
  fastify.put('/admin/intelligence/compset/search-params/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as Record<string, unknown>
    const result = await updateSearchParam(id, body as Parameters<typeof updateSearchParam>[1])
    if (!result) return reply.status(404).send({ error: 'Not found' })
    return reply.send(result)
  })

  // DELETE search param
  fastify.delete('/admin/intelligence/compset/search-params/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const deleted = await deleteSearchParam(id)
    if (!deleted) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })

  // PATCH activate/deactivate a search param (own: update isActive; inherited: upsert override)
  fastify.patch('/admin/intelligence/compset/search-params/:id/active', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as { isActive: boolean; orgId?: number | null; propertyId?: number | null }

    const orgId = (request.admin.role === 'super'
      ? (body.orgId ?? request.admin.organizationId)
      : request.admin.organizationId) ?? null
    const propertyId = body.propertyId ?? null

    const result = await updateSearchParamActive(id, { orgId, propertyId }, body.isActive)
    if (!result) return reply.status(404).send({ error: 'Not found' })
    return reply.send(result)
  })

  // GET competitors
  fastify.get('/admin/intelligence/compset/competitors', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    return reply.send(await listCompetitors(propertyId))
  })

  // POST competitor
  fastify.post('/admin/intelligence/compset/competitors', async (request, reply) => {
    const body = request.body as { propertyId: number; name: string; searchUrl?: string | null; sortOrder?: number }
    const result = await createCompetitor(body)
    if ('error' in result) return reply.status(400).send({ error: result.error })
    return reply.status(201).send(result)
  })

  // PUT competitor
  fastify.put('/admin/intelligence/compset/competitors/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as Record<string, unknown>
    const result = await updateCompetitor(id, body as Parameters<typeof updateCompetitor>[1])
    if (!result) return reply.status(404).send({ error: 'Not found' })
    return reply.send(result)
  })

  // DELETE competitor
  fastify.delete('/admin/intelligence/compset/competitors/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const deleted = await deleteCompetitor(id)
    if (!deleted) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })

  // POST run single competitor (manual trigger)
  fastify.post('/admin/intelligence/compset/competitors/:id/run', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const competitor = await prisma.compSetCompetitor.findUnique({ where: { id }, select: { propertyId: true } })
    if (!competitor) return reply.status(404).send({ error: 'Not found' })
    setCompetitorRunStatus(id, { status: 'running', startedAt: new Date().toISOString(), totalParams: 0, doneParams: 0, found: 0, notFound: 0, errors: 0 })
    void runSingleCompetitor(id).catch(err =>
      fastify.log.warn({ err, competitorId: id }, '[CompSet] Single-competitor background run failed'),
    )
    return reply.send({ started: true })
  })

  // GET per-competitor run status (progress + last-run stats)
  fastify.get('/admin/intelligence/compset/competitors/:id/run/status', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    return reply.send(getCompetitorRunStatus(id))
  })

  // POST run (manual trigger)
  fastify.post('/admin/intelligence/compset/run', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    void runPropertyCompSet(propertyId).catch(err =>
      fastify.log.warn({ err, propertyId }, '[CompSet] Background run failed'),
    )
    return reply.send({ started: true })
  })

  // GET run status (progress + last-run stats)
  fastify.get('/admin/intelligence/compset/run/status', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    return reply.send(getRunStatus(propertyId))
  })

  // ── Room Mappings ─────────────────────────────────────────────────────────

  // GET mappings for a competitor
  fastify.get('/admin/intelligence/compset/competitors/:id/mappings', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    return reply.send(await getRoomMappings(id))
  })

  // PUT (replace) mappings for a competitor
  fastify.put('/admin/intelligence/compset/competitors/:id/mappings', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { mappings } = request.body as { mappings: Parameters<typeof replaceRoomMappings>[1] }
    return reply.send(await replaceRoomMappings(id, mappings ?? []))
  })

  // POST auto-map rooms using heuristic, then admin can override
  fastify.post('/admin/intelligence/compset/competitors/:id/mappings/auto', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { compRooms, ownRooms } = request.body as {
      compRooms: Array<{ roomName: string }>
      ownRooms: Array<{ roomName: string }>
    }
    return reply.send(await autoMapRooms(id, compRooms ?? [], ownRooms ?? []))
  })

  // GET results
  fastify.get('/admin/intelligence/compset/results', async (request, reply) => {
    const query = request.query as Record<string, string>
    const propertyId = query.propertyId ? parseInt(query.propertyId, 10) : undefined
    if (!propertyId) return reply.status(400).send({ error: 'propertyId is required' })
    const rows = await prisma.compSetResult.findMany({
      where: { propertyId },
      orderBy: [{ fetchedAt: 'desc' }, { competitorId: 'asc' }, { id: 'asc' }],
    })
    return reply.send(rows.map(r => ({
      ...r,
      fetchedAt: r.fetchedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })))
  })
}
