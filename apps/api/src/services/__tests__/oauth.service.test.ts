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

import { prisma } from '../../db/client.js'
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
