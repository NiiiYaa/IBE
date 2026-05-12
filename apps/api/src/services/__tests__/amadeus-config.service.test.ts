import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemAmadeusConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgAmadeusConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyAmadeusConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

vi.mock('../../utils/cache.js', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../ai-config.service.js', () => ({
  encryptApiKey: vi.fn((k: string) => `enc:${k}`),
  decryptApiKey: vi.fn((k: string) => k.replace('enc:', '')),
  maskApiKey: vi.fn((k: string) => k.slice(0, 4) + '****'),
}))

import { prisma } from '../../db/client.js'
import { cacheGet, cacheSet } from '../../utils/cache.js'
import {
  getResolvedAmadeusConfig,
  getAmadeusToken,
} from '../amadeus-config.service.js'

const mp = prisma as any
beforeEach(() => { vi.clearAllMocks() })

describe('getResolvedAmadeusConfig — system disabled', () => {
  it('returns null when system has enabled=false', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: false, enforceChildCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    expect(await getResolvedAmadeusConfig(42)).toBeNull()
  })
})

describe('getResolvedAmadeusConfig — org disabled', () => {
  it('returns null when org has enabled=false', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: false, systemServiceDisabled: false, enforceChildCreds: false,
      clientId: null, clientSecret: null,
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceChildCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    expect(await getResolvedAmadeusConfig(42)).toBeNull()
  })
})

describe('getResolvedAmadeusConfig — credential resolution', () => {
  it('uses system creds when org has none', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceChildCreds: false,
      clientId: null, clientSecret: null,
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceChildCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('sys-id')
    expect(result?.clientSecret).toBe('sys-secret')
  })

  it('uses org creds when org has own credentials', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceChildCreds: false,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 20, maxActivities: 5, stripLabel: 'Our Tours',
      stripMode: 'merged', stripDefaultFolded: true, stripAutoFoldSecs: 30,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceChildCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('org-id')
    expect(result?.clientSecret).toBe('org-secret')
  })

  it('enforceChildCreds on system forces system creds even when org has own', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue(null)
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceChildCreds: false,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceChildCreds: true,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('sys-id')
  })

  it('property overrides radiusKm when set', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false,
      clientId: null, clientSecret: null,
      radiusKm: 5, maxActivities: null, stripLabel: null, stripMode: null,
    })
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceChildCreds: false,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 20, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceChildCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.radiusKm).toBe(5)
  })

  it('enforceChildCreds on org forces org creds even when property has own', async () => {
    mp.property.findUnique.mockResolvedValue({ organizationId: 1 })
    mp.propertyAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false,
      clientId: 'enc:prop-id', clientSecret: 'enc:prop-secret',
      radiusKm: null, maxActivities: null, stripLabel: null, stripMode: null,
    })
    mp.orgAmadeusConfig.findUnique.mockResolvedValue({
      enabled: true, systemServiceDisabled: false, enforceChildCreds: true,
      clientId: 'enc:org-id', clientSecret: 'enc:org-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    mp.systemAmadeusConfig.findFirst.mockResolvedValue({
      enabled: true, enforceChildCreds: false,
      clientId: 'enc:sys-id', clientSecret: 'enc:sys-secret',
      radiusKm: 10, maxActivities: 10, stripLabel: 'Activities & Tours',
      stripMode: 'separate', stripDefaultFolded: false, stripAutoFoldSecs: 15,
    })
    const result = await getResolvedAmadeusConfig(42)
    expect(result?.clientId).toBe('org-id')
    expect(result?.clientSecret).toBe('org-secret')
  })
})

describe('getAmadeusToken', () => {
  const mockCache = cacheGet as ReturnType<typeof vi.fn>
  const mockSet = cacheSet as ReturnType<typeof vi.fn>

  it('returns cached token without fetching', async () => {
    mockCache.mockResolvedValueOnce('cached-token')
    const result = await getAmadeusToken('https://example.com/token', 'id', 'secret')
    expect(result).toBe('cached-token')
  })

  it('fetches, caches, and returns token on cache miss', async () => {
    mockCache.mockResolvedValueOnce(null)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new-token', expires_in: 3600 }),
    }) as any
    const result = await getAmadeusToken('https://example.com/token', 'id', 'secret')
    expect(result).toBe('new-token')
    expect(mockSet).toHaveBeenCalledWith(expect.stringMatching(/^amadeus:token:/), 'new-token', 3540)
  })

  it('throws when tokenUrl is empty', async () => {
    await expect(getAmadeusToken('', 'id', 'secret')).rejects.toThrow('Amadeus token URL not configured')
  })

  it('throws when auth fails', async () => {
    mockCache.mockResolvedValueOnce(null)
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }) as any
    await expect(getAmadeusToken('https://example.com/token', 'id', 'secret')).rejects.toThrow('Amadeus auth failed: 401')
  })
})
