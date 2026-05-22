import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    clusterHotel: { findMany: vi.fn(), findFirst: vi.fn() },
    clusterUser: { findMany: vi.fn() },
  },
}))

import { prisma } from '../../db/client.js'
import { resolveAccessiblePropertyIds, assertPropertyAccess, resolveEffectiveRole } from '../cluster-access.service.js'
import type { AdminPayload } from '../auth.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

function makeAdmin(overrides: Partial<AdminPayload> = {}): AdminPayload {
  return { adminId: 1, organizationId: 5, role: 'admin', ...overrides } as any
}

describe('resolveAccessiblePropertyIds', () => {
  it('returns "all" for super admin', async () => {
    const result = await resolveAccessiblePropertyIds(makeAdmin({ role: 'super', organizationId: null }))
    expect(result).toBe('all')
    expect(mp.clusterHotel.findMany).not.toHaveBeenCalled()
  })

  it('returns "all" for global-scope org admin', async () => {
    const result = await resolveAccessiblePropertyIds(makeAdmin({ clusterScope: false } as any))
    expect(result).toBe('all')
    expect(mp.clusterHotel.findMany).not.toHaveBeenCalled()
  })

  it('returns property IDs from assigned clusters for cluster-scoped user', async () => {
    mp.clusterHotel.findMany.mockResolvedValue([{ propertyId: 100 }, { propertyId: 200 }])
    const result = await resolveAccessiblePropertyIds(makeAdmin({ clusterScope: true } as any))
    expect(result).toEqual([100, 200])
    expect(mp.clusterHotel.findMany).toHaveBeenCalledWith({
      where: { cluster: { status: 'active', users: { some: { adminUserId: 1 } } } },
      select: { propertyId: true },
    })
  })

  it('returns empty array when cluster-scoped user has no assignments', async () => {
    mp.clusterHotel.findMany.mockResolvedValue([])
    const result = await resolveAccessiblePropertyIds(makeAdmin({ clusterScope: true } as any))
    expect(result).toEqual([])
  })
})

describe('assertPropertyAccess', () => {
  it('does not throw for global admin', async () => {
    await expect(assertPropertyAccess(makeAdmin({ clusterScope: false } as any), 100)).resolves.toBeUndefined()
    expect(mp.clusterHotel.findFirst).not.toHaveBeenCalled()
  })

  it('does not throw when property is in cluster', async () => {
    mp.clusterHotel.findFirst.mockResolvedValue({ id: 1 })
    await expect(assertPropertyAccess(makeAdmin({ clusterScope: true } as any), 100)).resolves.toBeUndefined()
  })

  it('throws 403 when property is not in any cluster', async () => {
    mp.clusterHotel.findFirst.mockResolvedValue(null)
    await expect(assertPropertyAccess(makeAdmin({ clusterScope: true } as any), 100)).rejects.toThrow('No access to this property')
  })
})

describe('resolveEffectiveRole', () => {
  it('returns null when user has no cluster assignment for this property', async () => {
    mp.clusterUser.findMany.mockResolvedValue([])
    const result = await resolveEffectiveRole(1, 100)
    expect(result).toBeNull()
  })

  it('returns the single role when user has one cluster assignment', async () => {
    mp.clusterUser.findMany.mockResolvedValue([{ role: 'observer' }])
    const result = await resolveEffectiveRole(1, 100)
    expect(result).toBe('observer')
  })

  it('returns the highest role when user has multiple cluster assignments', async () => {
    mp.clusterUser.findMany.mockResolvedValue([{ role: 'observer' }, { role: 'admin' }])
    const result = await resolveEffectiveRole(1, 100)
    expect(result).toBe('admin')
  })
})
