import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    onboardingInvitation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '../../db/client.js'
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  getInvitationByToken,
} from '../onboarding-invitation.service.js'

beforeEach(() => { vi.clearAllMocks() })

describe('createInvitation', () => {
  it('creates an invitation with 7-day expiry', async () => {
    const mockInv = { id: 1, token: 'abc', expiresAt: new Date(), ibeUrl: null, source: 'staff_invite' }
    vi.mocked(prisma.onboardingInvitation.create).mockResolvedValue(mockInv as any)

    const result = await createInvitation({
      organizationId: 5,
      pmsId: 4,
      pmsName: 'SiteMinder',
      contactEmail: 'test@hotel.com',
      createdByAdminId: 10,
    })

    expect(prisma.onboardingInvitation.create).toHaveBeenCalledOnce()
    const callArg = vi.mocked(prisma.onboardingInvitation.create).mock.calls[0]![0]!
    const expiry = (callArg as any).data.expiresAt as Date
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    expect(expiry.getTime() - Date.now()).toBeGreaterThan(sevenDays - 5000)
    expect(result).toBe(mockInv)
  })
})

describe('revokeInvitation', () => {
  it('sets revokedAt', async () => {
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any)
    await revokeInvitation(1)
    expect(prisma.onboardingInvitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { revokedAt: expect.any(Date) },
    })
  })
})

describe('getInvitationByToken', () => {
  it('returns invitation for valid token', async () => {
    const mockInv = { id: 1, token: 'tok', revokedAt: null, usedAt: null, expiresAt: new Date(Date.now() + 10000) }
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue(mockInv as any)
    const result = await getInvitationByToken('tok')
    expect(result).toBe(mockInv)
  })
})
