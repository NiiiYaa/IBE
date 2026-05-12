import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    orgMcpConfig: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/env.js', () => ({
  env: { WEB_BASE_URL: 'http://localhost:3000', OAUTH_PRIVATE_KEY_PEM: '', OAUTH_PUBLIC_KEY_PEM: '' },
}))

// Always return cache miss so tests exercise the DB path
vi.mock('../../utils/cache.js', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '../../db/client.js'
import { cacheGet, cacheSet } from '../../utils/cache.js'
import { getOAuthScope } from '../oauth.service.js'

const mp = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('getOAuthScope — revocation check (org in JWT payload)', () => {
  const revokedAt = new Date('2026-05-12T10:00:00.000Z')
  const revokedAtSec = revokedAt.getTime() / 1000

  it('rejects token issued before tokensRevokedAt', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: revokedAt })
    const result = await getOAuthScope('user:1', revokedAtSec - 1, 5)
    expect(result).toBeNull()
  })

  it('rejects token issued at exactly tokensRevokedAt', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: revokedAt })
    const result = await getOAuthScope('user:1', revokedAtSec, 5)
    expect(result).toBeNull()
  })

  it('allows token issued after tokensRevokedAt', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: revokedAt })
    const result = await getOAuthScope('user:1', revokedAtSec + 1, 5)
    expect(result).toEqual({ kind: 'org', orgId: 5 })
  })

  it('allows token when tokensRevokedAt is null', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: null })
    const result = await getOAuthScope('user:1', revokedAtSec + 1, 5)
    expect(result).toEqual({ kind: 'org', orgId: 5 })
  })

  it('allows token when OrgMcpConfig row does not exist', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockResolvedValue(null)
    const result = await getOAuthScope('user:1', revokedAtSec + 1, 5)
    expect(result).toEqual({ kind: 'org', orgId: 5 })
  })

  it('allows token (fail-open) when DB lookup throws', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockRejectedValue(new Error('DB error'))
    const result = await getOAuthScope('user:1', revokedAtSec + 1, 5)
    expect(result).toEqual({ kind: 'org', orgId: 5 })
  })

  it('still rejects inactive user even if token is recent', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: false })
    mp.orgMcpConfig.findUnique.mockResolvedValue(null)
    const result = await getOAuthScope('user:1', revokedAtSec + 1, 5)
    expect(result).toBeNull()
  })
})

describe('getOAuthScope — revocation check (org from user DB lookup)', () => {
  const revokedAt = new Date('2026-05-12T10:00:00.000Z')
  const revokedAtSec = revokedAt.getTime() / 1000

  it('rejects token issued before tokensRevokedAt (fallback path)', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true, organizationId: 7 })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: revokedAt })
    // No org arg → fallback path
    const result = await getOAuthScope('user:1', revokedAtSec - 1)
    expect(result).toBeNull()
  })

  it('allows token issued after tokensRevokedAt (fallback path)', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true, organizationId: 7 })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: revokedAt })
    const result = await getOAuthScope('user:1', revokedAtSec + 1)
    expect(result).toEqual({ kind: 'org', orgId: 7 })
  })

  it('allows token (fail-open) when DB lookup throws (fallback path)', async () => {
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true, organizationId: 7 })
    mp.orgMcpConfig.findUnique.mockRejectedValue(new Error('DB error'))
    const result = await getOAuthScope('user:1', revokedAtSec + 1)
    expect(result).toEqual({ kind: 'org', orgId: 7 })
  })
})

describe('getOAuthScope — cache behaviour', () => {
  const mc = cacheGet as ReturnType<typeof vi.fn>
  const ms = cacheSet as ReturnType<typeof vi.fn>

  beforeEach(() => { vi.clearAllMocks() })

  it('skips DB when cache has a revoked-at hit and rejects the token', async () => {
    const revokedAt = new Date('2026-05-12T10:00:00.000Z')
    mc.mockResolvedValueOnce({ ts: revokedAt.toISOString() })
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })

    const result = await getOAuthScope('user:1', revokedAt.getTime() / 1000 - 1, 5)

    expect(result).toBeNull()
    expect(mp.orgMcpConfig.findUnique).not.toHaveBeenCalled()
  })

  it('skips DB when cache has a never-revoked hit and allows the token', async () => {
    mc.mockResolvedValueOnce({ ts: null })
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })

    const result = await getOAuthScope('user:1', 9999999999, 5)

    expect(result).toEqual({ kind: 'org', orgId: 5 })
    expect(mp.orgMcpConfig.findUnique).not.toHaveBeenCalled()
  })

  it('writes DB result to cache on a miss', async () => {
    const revokedAt = new Date('2026-05-12T10:00:00.000Z')
    mc.mockResolvedValueOnce(null)  // cache miss
    mp.adminUser.findUnique.mockResolvedValue({ isActive: true })
    mp.orgMcpConfig.findUnique.mockResolvedValue({ tokensRevokedAt: revokedAt })

    await getOAuthScope('user:1', 9999999999, 5)

    expect(ms).toHaveBeenCalledWith(
      'mcp:revoked:5',
      { ts: revokedAt.toISOString() },
      60,
    )
  })
})
