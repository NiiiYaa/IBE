import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  listClusters, createCluster, updateCluster, setClusterStatus, softDeleteCluster,
  getClusterDetail, addHotelToCluster, removeHotelFromCluster,
  addUserToCluster, updateUserClusterRole, removeUserFromCluster,
  listOrgHotelsWithClusters, listOrgUsersWithClusters, setAdminUserClusterScope,
} from '../services/cluster.service.js'
import type { ClusterRole } from '@ibe/shared'

function resolveOrgId(request: FastifyRequest): number | null {
  const admin = (request as any).admin
  if (admin.role === 'super') {
    const rawOrgId = (request.query as Record<string, string>).orgId
    return rawOrgId ? parseInt(rawOrgId, 10) : null
  }
  return admin.organizationId ?? null
}

export async function clusterRoutes(fastify: FastifyInstance) {

  // GET list clusters
  fastify.get('/admin/clusters', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await listClusters(orgId))
  })

  // POST create cluster
  fastify.post('/admin/clusters', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const { name } = request.body as { name: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    return reply.status(201).send(await createCluster(orgId, name.trim()))
  })

  // PUT update cluster name
  fastify.put('/admin/clusters/:id', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const { name } = request.body as { name: string }
    const result = await updateCluster(id, orgId, { name: name.trim() })
    if (!result) return reply.status(404).send({ error: 'Cluster not found' })
    return reply.send(result)
  })

  // POST activate/deactivate
  fastify.post('/admin/clusters/:id/activate', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const result = await setClusterStatus(id, orgId, 'active')
    if (!result) return reply.status(404).send({ error: 'Cluster not found' })
    return reply.send(result)
  })

  fastify.post('/admin/clusters/:id/deactivate', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const result = await setClusterStatus(id, orgId, 'inactive')
    if (!result) return reply.status(404).send({ error: 'Cluster not found' })
    return reply.send(result)
  })

  // DELETE (soft delete)
  fastify.delete('/admin/clusters/:id', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const ok = await softDeleteCluster(id, orgId)
    if (!ok) return reply.status(404).send({ error: 'Cluster not found' })
    return reply.status(204).send()
  })

  // GET cluster detail
  fastify.get('/admin/clusters/:id', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const id = parseInt((request.params as { id: string }).id, 10)
    const result = await getClusterDetail(id, orgId)
    if (!result) return reply.status(404).send({ error: 'Cluster not found' })
    return reply.send(result)
  })

  // POST add hotel to cluster
  fastify.post('/admin/clusters/:id/hotels', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const clusterId = parseInt((request.params as { id: string }).id, 10)
    const { propertyId } = request.body as { propertyId: number }
    try {
      await addHotelToCluster(clusterId, propertyId, orgId)
      return reply.status(201).send({ ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      return reply.status(400).send({ error: msg })
    }
  })

  // DELETE remove hotel from cluster
  fastify.delete('/admin/clusters/:id/hotels/:propertyId', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const { id, propertyId } = request.params as { id: string; propertyId: string }
    await removeHotelFromCluster(parseInt(id, 10), parseInt(propertyId, 10), orgId)
    return reply.status(204).send()
  })

  // POST add user to cluster
  fastify.post('/admin/clusters/:id/users', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const clusterId = parseInt((request.params as { id: string }).id, 10)
    const { adminUserId, role } = request.body as { adminUserId: number; role: ClusterRole }
    try {
      await addUserToCluster(clusterId, adminUserId, role, orgId)
      return reply.status(201).send({ ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      return reply.status(400).send({ error: msg })
    }
  })

  // PUT change user role in cluster
  fastify.put('/admin/clusters/:id/users/:adminUserId', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const { id, adminUserId } = request.params as { id: string; adminUserId: string }
    const { role } = request.body as { role: ClusterRole }
    try {
      await updateUserClusterRole(parseInt(id, 10), parseInt(adminUserId, 10), role, orgId)
      return reply.send({ ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      return reply.status(400).send({ error: msg })
    }
  })

  // DELETE remove user from cluster
  fastify.delete('/admin/clusters/:id/users/:adminUserId', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    const { id, adminUserId } = request.params as { id: string; adminUserId: string }
    await removeUserFromCluster(parseInt(id, 10), parseInt(adminUserId, 10), orgId)
    return reply.status(204).send()
  })

  // GET hotels cross-cluster view
  fastify.get('/admin/clusters-hotels', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await listOrgHotelsWithClusters(orgId))
  })

  // GET users cross-cluster view
  fastify.get('/admin/clusters-users', async (request, reply) => {
    const orgId = resolveOrgId(request)
    if (!orgId) return reply.status(400).send({ error: 'orgId required' })
    return reply.send(await listOrgUsersWithClusters(orgId))
  })

  // PATCH toggle clusterScope on an admin user
  fastify.patch('/admin/admin-users/:id/cluster-scope', async (request, reply) => {
    if (request.admin.role !== 'super' && request.admin.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    const id = parseInt((request.params as { id: string }).id, 10)
    const { clusterScope } = request.body as { clusterScope: boolean }
    await setAdminUserClusterScope(id, clusterScope)
    return reply.send({ ok: true })
  })
}
