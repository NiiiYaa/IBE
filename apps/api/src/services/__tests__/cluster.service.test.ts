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
    adminUser: { findMany: vi.fn(), update: vi.fn() },
    property: { findMany: vi.fn() },
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
beforeEach(() => vi.clearAllMocks())

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
    mp.clusterHotel.create.mockResolvedValue({})
    await addHotelToCluster(1, 100, 5)
    expect(mp.clusterHotel.create).toHaveBeenCalledWith({ data: { clusterId: 1, propertyId: 100 } })
  })

  it('throws when cluster not in org', async () => {
    mp.cluster.findFirst.mockResolvedValue(null)
    await expect(addHotelToCluster(1, 100, 5)).rejects.toThrow('Cluster not found')
  })
})

describe('addUserToCluster', () => {
  it('creates a ClusterUser row with role', async () => {
    mp.cluster.findFirst.mockResolvedValue({ id: 1 })
    mp.clusterUser.create.mockResolvedValue({})
    await addUserToCluster(1, 42, 'admin', 5)
    expect(mp.clusterUser.create).toHaveBeenCalledWith({ data: { clusterId: 1, adminUserId: 42, role: 'admin' } })
  })
})

describe('setAdminUserClusterScope', () => {
  it('updates clusterScope on AdminUser', async () => {
    mp.adminUser.update.mockResolvedValue({})
    await setAdminUserClusterScope(42, true)
    expect(mp.adminUser.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { clusterScope: true } })
  })
})
