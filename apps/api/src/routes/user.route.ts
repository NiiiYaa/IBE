import type { FastifyInstance } from 'fastify'
import { listUsers, listAllUsers, createUser, updateUser, deleteUser, resetUserPassword, setOrgHyperGuestId, setUserPropertyIds, listOrgs, createOrg } from '../services/user.service.js'
import { listProperties } from '../services/property-registry.service.js'

const ALLOWED_ROLES = ['admin', 'observer', 'user']

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/admin/users', async (request, reply) => {
    const users = request.admin.role === 'super'
      ? await listAllUsers()
      : await listUsers(request.admin.organizationId!)
    return reply.send(users)
  })

  // Super-only: list all orgs
  fastify.get('/admin/super/orgs', async (request, reply) => {
    if (request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Forbidden' })
    return reply.send(await listOrgs())
  })

  // Super-only: create an org
  fastify.post('/admin/super/orgs', async (request, reply) => {
    if (request.admin.role !== 'super')
      return reply.status(403).send({ error: 'Forbidden' })
    const { name, hyperGuestOrgId } = request.body as { name?: string; hyperGuestOrgId?: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    try {
      const org = await createOrg({ name, hyperGuestOrgId })
      return reply.status(201).send(org)
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : 'Failed to create org' })
    }
  })

  // Super-only: update any org's HG Org ID
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
    const body = request.body as { email?: string; name?: string; role?: string; orgId?: number }
    if (!body.email?.trim()) return reply.status(400).send({ error: 'email is required' })
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!body.role || !ALLOWED_ROLES.includes(body.role))
      return reply.status(400).send({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })

    const isSuper = request.admin.role === 'super'
    const orgId = isSuper ? body.orgId : request.admin.organizationId
    if (!orgId) return reply.status(400).send({ error: 'orgId is required' })

    try {
      const result = await createUser(orgId, { email: body.email, name: body.name, role: body.role })
      return reply.status(201).send(result)
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : 'Failed to create user' })
    }
  })

  fastify.put('/admin/users/:id', async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10)
    if (id === request.admin.adminId)
      return reply.status(400).send({ error: 'You cannot edit your own account here' })

    const body = request.body as { name?: string; role?: string; isActive?: boolean }
    if (body.role !== undefined && !ALLOWED_ROLES.includes(body.role))
      return reply.status(400).send({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })

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
