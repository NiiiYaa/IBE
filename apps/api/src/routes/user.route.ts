import type { FastifyInstance } from 'fastify'
import { listUsers, listAllUsers, createUser, updateUser, deleteUser, reviveUser, resetUserPassword, setOrgHyperGuestId, setUserPropertyIds, listOrgs, createOrg, updateOrg, setOrgActive, softDeleteOrg, reviveOrg, sendAdminCredentials } from '../services/user.service.js'
import { listProperties } from '../services/property-registry.service.js'
import { updateOrgSettings } from '../services/org.service.js'

const ALLOWED_ROLES = ['admin', 'observer', 'user', 'affiliate']

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/users', async (request, reply) => {
    const onlyDeleted = (request.query as Record<string, string>).includeDeleted === 'true'
    const users = request.admin.role === 'super'
      ? await listAllUsers(onlyDeleted)
      : await listUsers(request.admin.organizationId!, onlyDeleted)
    return reply.send(users)
  })

  // Super-only: list all orgs
  fastify.get('/admin/super/orgs', async (request, reply) => {
    if (request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Forbidden' })
    const onlyDeleted = (request.query as Record<string, string>).includeDeleted === 'true'
    return reply.send(await listOrgs(onlyDeleted))
  })

  // Super-only: create an org
  fastify.post('/admin/super/orgs', async (request, reply) => {
    if (request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Forbidden' })
    const { name, hyperGuestOrgId, hyperGuestBearerToken, orgType } = request.body as { name?: string; hyperGuestOrgId?: string; hyperGuestBearerToken?: string; orgType?: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    try {
      const org = await createOrg({ name, hyperGuestOrgId, orgType })
      if (hyperGuestBearerToken?.trim()) {
        await updateOrgSettings(org.id, { hyperGuestBearerToken: hyperGuestBearerToken.trim() })
      }
      return reply.status(201).send(org)
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : 'Failed to create org' })
    }
  })

  // Super-only: edit org
  fastify.put('/admin/super/orgs/:orgId', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const orgId = parseInt((request.params as { orgId: string }).orgId, 10)
    const { name, hyperGuestOrgId, orgType, hyperGuestBearerToken } = request.body as { name?: string; hyperGuestOrgId?: string; orgType?: string; hyperGuestBearerToken?: string | null }
    try {
      const org = await updateOrg(orgId, { name, hyperGuestOrgId, orgType })
      if (hyperGuestBearerToken !== undefined) {
        await updateOrgSettings(org.id, { hyperGuestBearerToken: hyperGuestBearerToken?.trim() || null })
      }
      return reply.send(org)
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : 'Failed to update' })
    }
  })

  // Super-only: enable / disable org
  fastify.patch('/admin/super/orgs/:orgId/active', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const orgId = parseInt((request.params as { orgId: string }).orgId, 10)
    const { isActive } = request.body as { isActive: boolean }
    await setOrgActive(orgId, isActive)
    return reply.send({ ok: true })
  })

  // Super-only: soft-delete org (sets disabled + deletedAt, hides from list)
  fastify.delete('/admin/super/orgs/:orgId', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const orgId = parseInt((request.params as { orgId: string }).orgId, 10)
    await softDeleteOrg(orgId)
    return reply.send({ ok: true })
  })

  // Super-only: revive a soft-deleted org
  fastify.post('/admin/super/orgs/:orgId/revive', async (request, reply) => {
    if (request.admin.role !== 'super') return reply.status(403).send({ error: 'Forbidden' })
    const orgId = parseInt((request.params as { orgId: string }).orgId, 10)
    await reviveOrg(orgId)
    return reply.send({ ok: true })
  })

  // Super-only: update any org's HG Org ID (kept for backwards compat)
  fastify.put('/admin/super/orgs/:orgId/hg-org-id', async (request, reply) => {
    if (request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Forbidden' })
    const orgId = parseInt((request.params as { orgId: string }).orgId, 10)
    const { hyperGuestOrgId } = request.body as { hyperGuestOrgId?: string }
    try {
      await setOrgHyperGuestId(orgId, hyperGuestOrgId?.trim() || null)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : 'Failed to update' })
    }
  })

  fastify.post('/admin/users', async (request, reply) => {
    const body = request.body as { email?: string; name?: string; role?: string; orgId?: number; phone?: string }
    if (!body.email?.trim()) return reply.status(400).send({ error: 'email is required' })
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!body.role || !ALLOWED_ROLES.includes(body.role))
      return reply.status(400).send({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })

    const isSuper = request.admin.role === 'super'
    const isAffiliate = body.role === 'affiliate'
    const orgId = isSuper ? (isAffiliate ? null : body.orgId) : request.admin.organizationId
    if (!orgId && !isAffiliate) return reply.status(400).send({ error: 'orgId is required' })

    try {
      const result = await createUser(orgId ?? null, { email: body.email, name: body.name, role: body.role, ...(body.phone ? { phone: body.phone } : {}) })
      return reply.status(201).send(result)
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : 'Failed to create user' })
    }
  })

  fastify.post('/admin/users/send-credentials', async (request, reply) => {
    const body = request.body as {
      channel?: 'email' | 'whatsapp'
      to?: string
      credentials?: { name: string; email: string; temporaryPassword: string; loginUrl: string }
    }
    if (!body.channel || !body.to?.trim() || !body.credentials)
      return reply.status(400).send({ error: 'channel, to and credentials are required' })
    const orgId = request.admin.role === 'super' ? null : request.admin.organizationId
    const result = await sendAdminCredentials(orgId, body.channel, body.to.trim(), body.credentials)
    if (!result.ok) return reply.status(502).send({ error: result.error ?? 'Send failed' })
    return reply.send({ ok: true })
  })

  fastify.put('/admin/users/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const isSelf = id === request.admin.adminId

    const body = request.body as { name?: string; role?: string; isActive?: boolean; phone?: string | null }
    if (body.role !== undefined && !ALLOWED_ROLES.includes(body.role))
      return reply.status(400).send({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })
    // Prevent self-demotion or self-deactivation
    if (isSelf && (body.role !== undefined || body.isActive === false))
      return reply.status(400).send({ error: 'You cannot change your own role or deactivate your own account' })

    try {
      const user = await updateUser(request.admin.organizationId!, id, body)
      return reply.send(user)
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : 'Failed to update user' })
    }
  })

  fastify.post('/admin/users/:id/reset-password', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    try {
      const result = await resetUserPassword(request.admin.organizationId!, id)
      return reply.send(result)
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : 'Failed to reset password' })
    }
  })

  fastify.delete('/admin/users/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    if (id === request.admin.adminId)
      return reply.status(400).send({ error: 'You cannot delete your own account' })

    try {
      await deleteUser(request.admin.organizationId!, id)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : 'Failed to delete user' })
    }
  })

  fastify.post('/admin/users/:id/revive', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    try {
      await reviveUser(request.admin.organizationId!, id)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : 'Failed to revive user' })
    }
  })

  // Returns the available properties for a user's org (works for both super and admin callers)
  fastify.get('/admin/users/:id/org-properties', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const { prisma } = await import('../db/client.js')
    const user = await prisma.adminUser.findUnique({ where: { id } })
    if (!user || (request.admin.organizationId !== null && user.organizationId !== request.admin.organizationId))
      return reply.status(404).send({ error: 'User not found' })
    if (user.organizationId === null) return reply.send([])
    const properties = await listProperties(user.organizationId)
    return reply.send(properties)
  })

  fastify.put('/admin/users/:id/properties', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    const body = request.body as { propertyIds?: number[] }
    if (!Array.isArray(body.propertyIds))
      return reply.status(400).send({ error: 'propertyIds must be an array' })

    try {
      await setUserPropertyIds(request.admin.organizationId, id, body.propertyIds)
      return reply.send({ ok: true })
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : 'Failed to update properties' })
    }
  })
}
