import { prisma } from '../db/client.js'
import type { Cluster, ClusterDetail, ClusterRole, HotelClusterRow, AdminClusterSummary } from '@ibe/shared'

function toCluster(row: {
  id: number; organizationId: number; name: string; status: string;
  _count: { hotels: number; users: number }
}): Cluster {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status as 'active' | 'inactive',
    hotelCount: row._count.hotels,
    userCount: row._count.users,
  }
}

export async function listClusters(organizationId: number): Promise<Cluster[]> {
  const rows = await prisma.cluster.findMany({
    where: { organizationId, status: { not: 'deleted' } },
    include: { _count: { select: { hotels: true, users: true } } },
    orderBy: { name: 'asc' },
  })
  return rows.map(toCluster)
}

export async function createCluster(organizationId: number, name: string): Promise<Cluster> {
  const row = await prisma.cluster.create({
    data: { organizationId, name },
    include: { _count: { select: { hotels: true, users: true } } },
  })
  return toCluster(row)
}

export async function updateCluster(id: number, organizationId: number, data: { name: string }): Promise<Cluster | null> {
  const existing = await prisma.cluster.findFirst({ where: { id, organizationId, status: { not: 'deleted' } } })
  if (!existing) return null
  const row = await prisma.cluster.update({
    where: { id },
    data: { name: data.name },
    include: { _count: { select: { hotels: true, users: true } } },
  })
  return toCluster(row)
}

export async function setClusterStatus(id: number, organizationId: number, status: 'active' | 'inactive'): Promise<Cluster | null> {
  const existing = await prisma.cluster.findFirst({ where: { id, organizationId, status: { not: 'deleted' } } })
  if (!existing) return null
  const row = await prisma.cluster.update({
    where: { id },
    data: { status },
    include: { _count: { select: { hotels: true, users: true } } },
  })
  return toCluster(row)
}

export async function softDeleteCluster(id: number, organizationId: number): Promise<boolean> {
  const existing = await prisma.cluster.findFirst({ where: { id, organizationId } })
  if (!existing) return false
  await prisma.cluster.update({ where: { id }, data: { status: 'deleted' } })
  return true
}

export async function getClusterDetail(id: number, organizationId: number): Promise<ClusterDetail | null> {
  const row = await prisma.cluster.findFirst({
    where: { id, organizationId, status: { not: 'deleted' } },
    include: {
      hotels: { select: { propertyId: true } },
      users: { select: { adminUserId: true, role: true } },
    },
  })
  if (!row) return null

  const propertyIds = row.hotels.map(h => h.propertyId)
  const adminUserIds = row.users.map(u => u.adminUserId)

  const [properties, adminUsers] = await Promise.all([
    propertyIds.length > 0
      ? prisma.property.findMany({ where: { propertyId: { in: propertyIds } }, select: { propertyId: true, name: true } })
      : [],
    adminUserIds.length > 0
      ? prisma.adminUser.findMany({ where: { id: { in: adminUserIds } }, select: { id: true, name: true, email: true } })
      : [],
  ])

  const propMap = new Map(properties.map(p => [p.propertyId, p.name]))
  const userMap = new Map(adminUsers.map(u => [u.id, u]))

  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status as 'active' | 'inactive',
    hotels: row.hotels.map(h => ({ propertyId: h.propertyId, propertyName: propMap.get(h.propertyId) ?? `Property ${h.propertyId}` })),
    users: row.users.map(u => {
      const admin = userMap.get(u.adminUserId)
      return { adminUserId: u.adminUserId, name: admin?.name ?? '', email: admin?.email ?? '', role: u.role as ClusterRole }
    }),
  }
}

async function assertClusterInOrg(clusterId: number, organizationId: number): Promise<void> {
  const cluster = await prisma.cluster.findFirst({ where: { id: clusterId, organizationId, status: { not: 'deleted' } } })
  if (!cluster) throw new Error('Cluster not found')
}

export async function addHotelToCluster(clusterId: number, propertyId: number, organizationId: number): Promise<void> {
  await assertClusterInOrg(clusterId, organizationId)
  const prop = await prisma.property.findFirst({ where: { propertyId, organizationId }, select: { propertyId: true } })
  if (!prop) throw new Error('Property not found in organisation')
  await prisma.clusterHotel.create({ data: { clusterId, propertyId } })
}

export async function removeHotelFromCluster(clusterId: number, propertyId: number, organizationId: number): Promise<void> {
  await assertClusterInOrg(clusterId, organizationId)
  await prisma.clusterHotel.deleteMany({ where: { clusterId, propertyId } })
}

export async function addUserToCluster(clusterId: number, adminUserId: number, role: ClusterRole, organizationId: number): Promise<void> {
  await assertClusterInOrg(clusterId, organizationId)
  const user = await prisma.adminUser.findFirst({ where: { id: adminUserId, organizationId }, select: { id: true } })
  if (!user) throw new Error('User not found in organisation')
  await prisma.clusterUser.create({ data: { clusterId, adminUserId, role } })
}

export async function updateUserClusterRole(clusterId: number, adminUserId: number, role: ClusterRole, organizationId: number): Promise<void> {
  await assertClusterInOrg(clusterId, organizationId)
  const existing = await prisma.clusterUser.findFirst({ where: { clusterId, adminUserId } })
  if (!existing) throw new Error('User not in cluster')
  await prisma.clusterUser.update({ where: { id: existing.id }, data: { role } })
}

export async function removeUserFromCluster(clusterId: number, adminUserId: number, organizationId: number): Promise<void> {
  await assertClusterInOrg(clusterId, organizationId)
  await prisma.clusterUser.deleteMany({ where: { clusterId, adminUserId } })
}

export async function listOrgHotelsWithClusters(organizationId: number): Promise<HotelClusterRow[]> {
  const [properties, clusterHotels] = await Promise.all([
    prisma.property.findMany({ where: { organizationId }, select: { propertyId: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.clusterHotel.findMany({
      where: { cluster: { organizationId, status: { not: 'deleted' } } },
      select: { propertyId: true, cluster: { select: { id: true, name: true } } },
    }),
  ])
  const clustersByProp = new Map<number, { id: number; name: string }[]>()
  for (const ch of clusterHotels) {
    const list = clustersByProp.get(ch.propertyId) ?? []
    list.push({ id: ch.cluster.id, name: ch.cluster.name })
    clustersByProp.set(ch.propertyId, list)
  }
  return properties.map(p => ({
    propertyId: p.propertyId,
    propertyName: p.name ?? `Property ${p.propertyId}`,
    clusters: clustersByProp.get(p.propertyId) ?? [],
  }))
}

export async function listOrgUsersWithClusters(organizationId: number): Promise<AdminClusterSummary[]> {
  const [users, clusterUsers] = await Promise.all([
    prisma.adminUser.findMany({
      where: { organizationId, isActive: true, role: { not: 'super' } },
      select: { id: true, name: true, email: true, clusterScope: true },
      orderBy: { name: 'asc' },
    }),
    prisma.clusterUser.findMany({
      where: { cluster: { organizationId, status: { not: 'deleted' } } },
      select: { adminUserId: true, role: true, cluster: { select: { id: true, name: true } } },
    }),
  ])
  const assignmentsByUser = new Map<number, { clusterId: number; clusterName: string; role: ClusterRole }[]>()
  for (const cu of clusterUsers) {
    const list = assignmentsByUser.get(cu.adminUserId) ?? []
    list.push({ clusterId: cu.cluster.id, clusterName: cu.cluster.name, role: cu.role as ClusterRole })
    assignmentsByUser.set(cu.adminUserId, list)
  }
  return users.map(u => ({
    adminUserId: u.id,
    name: u.name,
    email: u.email,
    clusterScope: u.clusterScope,
    assignments: assignmentsByUser.get(u.id) ?? [],
  }))
}

export async function setAdminUserClusterScope(adminUserId: number, clusterScope: boolean): Promise<void> {
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { clusterScope } })
}
