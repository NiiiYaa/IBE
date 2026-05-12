import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemMcpConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgMcpConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('../../utils/cache.js', () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '../../db/client.js'
import { cacheDel } from '../../utils/cache.js'
import {
  getSystemMcpConfig,
  getOrgMcpTokenExpirySettings,
  getEffectiveMcpTokenExpiry,
  setSystemMcpTokenExpiry,
  setOrgMcpTokenExpiry,
  revokeOrgTokens,
} from '../mcp.service.js'

const mp = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('getSystemMcpConfig', () => {
  it('returns oauthTokenExpiryDays from DB row', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: 30 })
    const result = await getSystemMcpConfig()
    expect(result).toEqual({ enabled: true, oauthTokenExpiryDays: 30 })
  })

  it('returns null expiry when row has null', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: null })
    const result = await getSystemMcpConfig()
    expect(result.oauthTokenExpiryDays).toBeNull()
  })

  it('returns null expiry when no row exists', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemMcpConfig()
    expect(result.oauthTokenExpiryDays).toBeNull()
  })
})

describe('getOrgMcpTokenExpirySettings', () => {
  it('returns org value when org has explicit override', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 7 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 30 })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: 7,
      effectiveTokenExpiryDays: 7,
      tokenExpiryInheritedFromSystem: false,
    })
  })

  it('falls back to system when org setting is null', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 90 })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: null,
      effectiveTokenExpiryDays: 90,
      tokenExpiryInheritedFromSystem: true,
    })
  })

  it('returns null effective when both are null (forever)', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: null,
      effectiveTokenExpiryDays: null,
      tokenExpiryInheritedFromSystem: true,
    })
  })

  it('falls back to system when no org row exists', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue(null)
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 365 })
    const result = await getOrgMcpTokenExpirySettings(1)
    expect(result).toEqual({
      oauthTokenExpiryDays: null,
      effectiveTokenExpiryDays: 365,
      tokenExpiryInheritedFromSystem: true,
    })
  })
})

describe('getEffectiveMcpTokenExpiry', () => {
  it('returns org value when set', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 7 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 30 })
    expect(await getEffectiveMcpTokenExpiry(1)).toBe(7)
  })

  it('returns null when both are null', async () => {
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    expect(await getEffectiveMcpTokenExpiry(1)).toBeNull()
  })
})

describe('setSystemMcpTokenExpiry', () => {
  it('updates existing row', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue({ id: 1, enabled: true, oauthTokenExpiryDays: null })
    mp.systemMcpConfig.update.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: 30 })
    const result = await setSystemMcpTokenExpiry(30)
    expect(mp.systemMcpConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { oauthTokenExpiryDays: 30 },
    })
    expect(result.oauthTokenExpiryDays).toBe(30)
  })

  it('creates row when none exists', async () => {
    mp.systemMcpConfig.findFirst.mockResolvedValue(null)
    mp.systemMcpConfig.create.mockResolvedValue({ enabled: true, oauthTokenExpiryDays: null })
    await setSystemMcpTokenExpiry(null)
    expect(mp.systemMcpConfig.create).toHaveBeenCalledWith({
      data: { enabled: true, oauthTokenExpiryDays: null },
    })
  })
})

describe('setOrgMcpTokenExpiry', () => {
  it('upserts the org expiry and returns updated settings', async () => {
    mp.orgMcpConfig.upsert.mockResolvedValue({})
    // After upsert, getOrgMcpTokenExpirySettings is called internally
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 90 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    const result = await setOrgMcpTokenExpiry(1, 90)
    expect(result.oauthTokenExpiryDays).toBe(90)
    expect(result.tokenExpiryInheritedFromSystem).toBe(false)
  })

  it('calls upsert with correct create defaults', async () => {
    mp.orgMcpConfig.upsert.mockResolvedValue({})
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: 30 })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: null })
    await setOrgMcpTokenExpiry(5, 30)
    expect(mp.orgMcpConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 5 },
        update: { oauthTokenExpiryDays: 30 },
        create: expect.objectContaining({ organizationId: 5, enabled: false, oauthTokenExpiryDays: 30 }),
      })
    )
  })

  it('clears override when days is null (inherits from system)', async () => {
    mp.orgMcpConfig.upsert.mockResolvedValue({})
    mp.orgMcpConfig.findUnique.mockResolvedValue({ oauthTokenExpiryDays: null })
    mp.systemMcpConfig.findFirst.mockResolvedValue({ oauthTokenExpiryDays: 90 })
    const result = await setOrgMcpTokenExpiry(1, null)
    expect(result.oauthTokenExpiryDays).toBeNull()
    expect(result.tokenExpiryInheritedFromSystem).toBe(true)
    expect(result.effectiveTokenExpiryDays).toBe(90)
  })
})

describe('revokeOrgTokens', () => {
  it('upserts tokensRevokedAt and returns ISO timestamp', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-05-12T10:00:00.000Z')
    vi.setSystemTime(now)
    mp.orgMcpConfig.upsert.mockResolvedValue({})

    const result = await revokeOrgTokens(42)

    expect(mp.orgMcpConfig.upsert).toHaveBeenCalledWith({
      where: { organizationId: 42 },
      create: expect.objectContaining({ organizationId: 42, tokensRevokedAt: now }),
      update: { tokensRevokedAt: now },
    })
    expect(cacheDel).toHaveBeenCalledWith('mcp:revoked:42')
    expect(result.tokensRevokedAt).toBe(now.toISOString())
    vi.useRealTimers()
  })
})
