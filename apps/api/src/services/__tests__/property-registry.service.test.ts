import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockProperty = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
}))

vi.mock('../../db/client.js', () => ({
  prisma: { property: mockProperty },
}))

import { addProperty, PropertyConflictError } from '../property-registry.service.js'

beforeEach(() => vi.clearAllMocks())

describe('addProperty', () => {
  it('creates a new property when none exists', async () => {
    mockProperty.findUnique.mockResolvedValue(null)
    mockProperty.count.mockResolvedValue(0)
    mockProperty.create.mockResolvedValue({
      id: 1, propertyId: 100, isDefault: true, isActive: true, lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    const result = await addProperty(1, 100)

    expect(mockProperty.create).toHaveBeenCalledWith({
      data: { organizationId: 1, propertyId: 100, isDefault: true },
    })
    expect(result.propertyId).toBe(100)
    expect(result.isDefault).toBe(true)
  })

  it('sets isDefault false when org already has properties', async () => {
    mockProperty.findUnique.mockResolvedValue(null)
    mockProperty.count.mockResolvedValue(2)
    mockProperty.create.mockResolvedValue({
      id: 2, propertyId: 200, isDefault: false, isActive: true, lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    await addProperty(1, 200)

    expect(mockProperty.create).toHaveBeenCalledWith({
      data: { organizationId: 1, propertyId: 200, isDefault: false },
    })
  })

  it('throws PropertyConflictError when property is active in another org', async () => {
    mockProperty.findUnique.mockResolvedValue({
      organizationId: 99,
      deletedAt: null,
      organization: { name: 'Other Org' },
    })

    await expect(addProperty(1, 100)).rejects.toThrow(PropertyConflictError)
    await expect(addProperty(1, 100)).rejects.toThrow('Other Org')
    expect(mockProperty.create).not.toHaveBeenCalled()
  })

  it('throws PropertyConflictError when property is already active in same org', async () => {
    mockProperty.findUnique.mockResolvedValue({
      organizationId: 1,
      deletedAt: null,
      organization: { name: 'My Org' },
    })

    await expect(addProperty(1, 100)).rejects.toThrow(PropertyConflictError)
    await expect(addProperty(1, 100)).rejects.toThrow('already registered for this organization')
    expect(mockProperty.create).not.toHaveBeenCalled()
  })

  it('restores soft-deleted property in same org', async () => {
    mockProperty.findUnique.mockResolvedValue({
      organizationId: 1,
      deletedAt: new Date('2023-01-01'),
      organization: { name: 'My Org' },
    })
    mockProperty.update.mockResolvedValue({
      id: 3, propertyId: 100, isDefault: false, isActive: true, lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    const result = await addProperty(1, 100)

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { propertyId: 100 },
      data: { deletedAt: null, isActive: true },
    })
    expect(result.isActive).toBe(true)
    expect(mockProperty.create).not.toHaveBeenCalled()
  })

  it('reassigns soft-deleted property from another org', async () => {
    mockProperty.findUnique.mockResolvedValue({
      organizationId: 99,
      deletedAt: new Date('2023-01-01'),
      organization: { name: 'Old Org' },
    })
    mockProperty.count.mockResolvedValue(1)
    mockProperty.update.mockResolvedValue({
      id: 4, propertyId: 100, isDefault: false, isActive: true, lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    const result = await addProperty(1, 100)

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { propertyId: 100 },
      data: { organizationId: 1, deletedAt: null, isActive: true, isDefault: false },
    })
    expect(result.isActive).toBe(true)
    expect(mockProperty.create).not.toHaveBeenCalled()
  })

  it('reassigns soft-deleted property as default when target org has no properties', async () => {
    mockProperty.findUnique.mockResolvedValue({
      organizationId: 99,
      deletedAt: new Date('2023-01-01'),
      organization: { name: 'Old Org' },
    })
    mockProperty.count.mockResolvedValue(0)
    mockProperty.update.mockResolvedValue({
      id: 5, propertyId: 100, isDefault: true, isActive: true, lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    await addProperty(1, 100)

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { propertyId: 100 },
      data: { organizationId: 1, deletedAt: null, isActive: true, isDefault: true },
    })
  })
})
