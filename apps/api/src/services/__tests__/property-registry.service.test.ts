import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HGPropertyStatic } from '@ibe/shared'

const mockProperty = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
}))

vi.mock('../../db/client.js', () => ({
  prisma: { property: mockProperty },
}))

import { addProperty, PropertyConflictError, checkPropertyCompleteness, setPropertyStatus } from '../property-registry.service.js'

beforeEach(() => { vi.clearAllMocks() })

function makeStaticData(overrides: Partial<HGPropertyStatic> = {}): HGPropertyStatic {
  return {
    id: 1,
    name: 'Grand Hotel',
    rating: 4,
    logo: '',
    group: '',
    isTest: 0,
    contact: {} as never,
    coordinates: {} as never,
    location: { address: '123 Main St', city: { id: 1, name: 'City', hereMapsId: '' }, countryCode: 'US', postcode: '12345' },
    descriptions: [],
    facilities: [],
    images: [],
    policies: [],
    ratePlans: [],
    rooms: [{ id: 1, hotelId: 1, pmsCode: 'R1', name: 'Standard', descriptions: [], facilities: [], images: [], beds: [], ratePlans: [] }],
    commission: { calculation: '', chargeType: '', value: 0 },
    created: '',
    ...overrides,
  } as HGPropertyStatic
}

describe('checkPropertyCompleteness', () => {
  it('returns true when name, rooms, and address are all present', () => {
    expect(checkPropertyCompleteness(makeStaticData())).toBe(true)
  })

  it('returns false when name is empty', () => {
    expect(checkPropertyCompleteness(makeStaticData({ name: '' }))).toBe(false)
  })

  it('returns false when name is whitespace', () => {
    expect(checkPropertyCompleteness(makeStaticData({ name: '   ' }))).toBe(false)
  })

  it('returns false when rooms array is empty', () => {
    expect(checkPropertyCompleteness(makeStaticData({ rooms: [] }))).toBe(false)
  })

  it('returns false when address is empty', () => {
    expect(checkPropertyCompleteness(makeStaticData({
      location: { address: '', city: { id: 1, name: 'City' }, countryCode: 'US', postcode: '12345' },
    }))).toBe(false)
  })
})

describe('addProperty', () => {
  it('creates a new property when none exists', async () => {
    mockProperty.findUnique.mockResolvedValue(null)
    mockProperty.count.mockResolvedValue(0)
    mockProperty.create.mockResolvedValue({
      id: 1, propertyId: 100, isDefault: true, status: 'active', lastSyncedAt: null, createdAt: new Date('2024-01-01'),
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
      id: 2, propertyId: 200, isDefault: false, status: 'active', lastSyncedAt: null, createdAt: new Date('2024-01-01'),
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
      id: 3, propertyId: 100, isDefault: false, status: 'active', lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    const result = await addProperty(1, 100)

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { propertyId: 100 },
      data: { deletedAt: null, status: 'active' },
    })
    expect(result.status).toBe('active')
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
      id: 4, propertyId: 100, isDefault: false, status: 'active', lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    const result = await addProperty(1, 100)

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { propertyId: 100 },
      data: { organizationId: 1, deletedAt: null, status: 'active', isDefault: false },
    })
    expect(result.status).toBe('active')
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
      id: 5, propertyId: 100, isDefault: true, status: 'active', lastSyncedAt: null, createdAt: new Date('2024-01-01'),
    })

    await addProperty(1, 100)

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { propertyId: 100 },
      data: { organizationId: 1, deletedAt: null, status: 'active', isDefault: true },
    })
  })
})

describe('setPropertyStatus', () => {
  it('updates property status to inactive', async () => {
    mockProperty.update.mockResolvedValue({})

    await setPropertyStatus(1, 10, 'inactive')

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { id: 10, organizationId: 1 },
      data: { status: 'inactive' },
    })
  })

  it('updates property status to active', async () => {
    mockProperty.update.mockResolvedValue({})

    await setPropertyStatus(null, 10, 'active')

    expect(mockProperty.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: 'active' },
    })
  })
})
