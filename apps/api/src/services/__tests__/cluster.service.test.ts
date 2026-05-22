import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    cluster: {
      findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(),
      create: vi.fn(), update: vi.fn(),
    },
    clusterHotel: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    clusterUser: {
      create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(),
    },
    adminUser: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    property: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import {
  listClusters,
  createCluster,
  updateCluster,
  setClusterStatus,
  softDeleteCluster,
  getClusterDetail,
  addHotelToCluster,
  removeHotelFromCluster,
  addUserToCluster,
  updateUserClusterRole,
  removeUserFromCluster,
  listOrgHotelsWithClusters,
  listOrgUsersWithClusters,
  setAdminUserClusterScope,
} from '../cluster.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

describe('listClusters', () => {
  it('returns active clusters with counts for org', async () => {
    mp.cluster.findMany.mockResolvedValue([
      { id: 1, organizationId: 5, name: 'Cluster A', status: 'active', _count: { hotels: 3, users: 2 } },
    ])
    const result = await listClusters(5)
    expect(result).toHaveLength(1)
    expect(result[0]!.hotelCount).toBe(3)
    expect(result[0]!.userCount).toBe(2)
    expect(mp.cluster.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 5, status: { not: 'deleted' } },
    }))
  })
})

describe('createCluster', () => {
  it('creates a cluster and returns it', async () => {
    mp.cluster.create.mockResolvedValue({ id: 1, organizationId: 5, name: 'New', status: 'active', _count: { hotels: 0, users: 0 } })
    const result = await createCluster(5, 'New')
    expect(result.name).toBe('New')
    expect(mp.cluster.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { organizationId: 5, name: 'New' },
    }))
  })
})

describe('softDeleteCluster', () => {
  it('sets status to deleted for cluster in org', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.cluster.update.mockResolvedValue({ id: 1 })
    const result = await softDeleteCluster(1, 5)
    expect(result).toBe(true)
    expect(mp.cluster.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'deleted' } })
  })

  it('returns false when cluster not found in org', async () => {
    mp.cluster.findFirst.mockResolvedValue(null)
    const result = await softDeleteCluster(99, 5)
    expect(result).toBe(false)
    expect(mp.cluster.update).not.toHaveBeenCalled()
  })
})

describe('addHotelToCluster', () => {
  it('creates a ClusterHotel row', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.property.findFirst.mockResolvedValue({ propertyId: 100 })
    mp.clusterHotel.create.mockResolvedValue({})
    await addHotelToCluster(1, 100, 5)
    expect(mp.clusterHotel.create).toHaveBeenCalledWith({ data: { clusterId: 1, propertyId: 100 } })
  })

  it('throws when cluster not in org', async () => {
    mp.cluster.findFirst.mockResolvedValue(null)
    await expect(addHotelToCluster(1, 100, 5)).rejects.toThrow('Cluster not found')
  })

  it('throws when property not in org', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.property.findFirst.mockResolvedValue(null)
    await expect(addHotelToCluster(1, 100, 5)).rejects.toThrow('Property not found in organisation')
  })
})

describe('addUserToCluster', () => {
  it('creates a ClusterUser row with role', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.adminUser.findFirst.mockResolvedValue({ id: 42 })
    mp.clusterUser.create.mockResolvedValue({})
    await addUserToCluster(1, 42, 'admin', 5)
    expect(mp.clusterUser.create).toHaveBeenCalledWith({ data: { clusterId: 1, adminUserId: 42, role: 'admin' } })
  })

  it('throws when user not in org', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.adminUser.findFirst.mockResolvedValue(null)
    await expect(addUserToCluster(1, 99, 'admin', 5)).rejects.toThrow('User not found in organisation')
  })
})

describe('setAdminUserClusterScope', () => {
  it('updates clusterScope on AdminUser', async () => {
    mp.adminUser.update.mockResolvedValue({})
    await setAdminUserClusterScope(42, true)
    expect(mp.adminUser.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { clusterScope: true } })
  })
})

describe('updateCluster', () => {
  it('returns updated cluster when found', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.cluster.update.mockResolvedValue({ id: 1, organizationId: 5, name: 'Updated', status: 'active', _count: { hotels: 0, users: 0 } })
    const result = await updateCluster(1, 5, { name: 'Updated' })
    expect(result?.name).toBe('Updated')
    expect(mp.cluster.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Updated' } }))
  })

  it('returns null when cluster not found', async () => {
    mp.cluster.findFirst.mockResolvedValue(null)
    const result = await updateCluster(99, 5, { name: 'x' })
    expect(result).toBeNull()
  })
})

describe('setClusterStatus', () => {
  it('sets status to inactive', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.cluster.update.mockResolvedValue({ id: 1, organizationId: 5, name: 'C', status: 'inactive', _count: { hotels: 0, users: 0 } })
    const result = await setClusterStatus(1, 5, 'inactive')
    expect(result?.status).toBe('inactive')
    expect(mp.cluster.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'inactive' } }))
  })

  it('returns null when cluster not found', async () => {
    mp.cluster.findFirst.mockResolvedValue(null)
    const result = await setClusterStatus(99, 5, 'active')
    expect(result).toBeNull()
  })
})

describe('getClusterDetail', () => {
  it('returns null when cluster not found', async () => {
    mp.cluster.findFirst.mockResolvedValue(null)
    const result = await getClusterDetail(99, 5)
    expect(result).toBeNull()
  })

  it('returns hydrated cluster detail with hotels and users', async () => {
    mp.cluster.findFirst.mockResolvedValue({
      id: 1, organizationId: 5, name: 'A', status: 'active',
      hotels: [{ propertyId: 100 }],
      users: [{ adminUserId: 42, role: 'admin' }],
    })
    mp.property.findMany.mockResolvedValue([{ propertyId: 100, name: 'Grand Hotel' }])
    mp.adminUser.findMany.mockResolvedValue([{ id: 42, name: 'John', email: 'john@test.com' }])
    const result = await getClusterDetail(1, 5)
    expect(result?.hotels).toHaveLength(1)
    expect(result?.hotels[0]?.propertyName).toBe('Grand Hotel')
    expect(result?.users[0]?.name).toBe('John')
    expect(result?.users[0]?.role).toBe('admin')
  })

  it('uses fallback name when property not found', async () => {
    mp.cluster.findFirst.mockResolvedValue({
      id: 1, organizationId: 5, name: 'A', status: 'active',
      hotels: [{ propertyId: 999 }],
      users: [],
    })
    mp.property.findMany.mockResolvedValue([])
    mp.adminUser.findMany.mockResolvedValue([])
    const result = await getClusterDetail(1, 5)
    expect(result?.hotels[0]?.propertyName).toBe('Property 999')
  })
})

describe('removeHotelFromCluster', () => {
  it('removes hotel when cluster exists in org', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.clusterHotel.deleteMany.mockResolvedValue({ count: 1 })
    await removeHotelFromCluster(1, 100, 5)
    expect(mp.clusterHotel.deleteMany).toHaveBeenCalledWith({ where: { clusterId: 1, propertyId: 100 } })
  })
})

describe('updateUserClusterRole', () => {
  it('updates role when user is in cluster', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.clusterUser.findFirst.mockResolvedValue({ id: 7, clusterId: 1, adminUserId: 42, role: 'user' })
    mp.clusterUser.update.mockResolvedValue({})
    await updateUserClusterRole(1, 42, 'admin', 5)
    expect(mp.clusterUser.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { role: 'admin' } })
  })

  it('throws when user not in cluster', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.clusterUser.findFirst.mockResolvedValue(null)
    await expect(updateUserClusterRole(1, 99, 'admin', 5)).rejects.toThrow('User not in cluster')
  })
})

describe('removeUserFromCluster', () => {
  it('removes user from cluster', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.clusterUser.deleteMany.mockResolvedValue({ count: 1 })
    await removeUserFromCluster(1, 42, 5)
    expect(mp.clusterUser.deleteMany).toHaveBeenCalledWith({ where: { clusterId: 1, adminUserId: 42 } })
  })
})

describe('listOrgHotelsWithClusters', () => {
  it('returns all properties with their cluster assignments', async () => {
    mp.property.findMany.mockResolvedValue([
      { propertyId: 100, name: 'Hotel A' },
      { propertyId: 200, name: 'Hotel B' },
    ])
    mp.clusterHotel.findMany.mockResolvedValue([
      { propertyId: 100, cluster: { id: 1, name: 'Cluster A' } },
    ])
    const result = await listOrgHotelsWithClusters(5)
    expect(result).toHaveLength(2)
    expect(result[0]?.clusters).toHaveLength(1)
    expect(result[0]?.clusters[0]?.name).toBe('Cluster A')
    expect(result[1]?.clusters).toHaveLength(0)
  })
})

describe('listOrgUsersWithClusters', () => {
  it('returns active non-super users with their assignments', async () => {
    mp.adminUser.findMany.mockResolvedValue([
      { id: 42, name: 'John', email: 'john@test.com', clusterScope: true },
    ])
    mp.clusterUser.findMany.mockResolvedValue([
      { adminUserId: 42, role: 'admin', cluster: { id: 1, name: 'Cluster A' } },
    ])
    const result = await listOrgUsersWithClusters(5)
    expect(result).toHaveLength(1)
    expect(result[0]?.assignments).toHaveLength(1)
    expect(result[0]?.assignments[0]?.clusterName).toBe('Cluster A')
    expect(result[0]?.clusterScope).toBe(true)
    expect(mp.adminUser.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true, role: { not: 'super' } }),
    }))
  })
})
