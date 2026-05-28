import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => ({
  prisma: {
    onboardingInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    onboardingSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../db/client.js';
import { initSession, getSession, advanceStep } from '../session.service.js';

beforeEach(() => { vi.clearAllMocks(); });

const futureDate = new Date(Date.now() + 86400000);

describe('initSession', () => {
  it('throws if token is invalid', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue(null);
    await expect(initSession('bad-token')).rejects.toThrow('invalid');
  });

  it('throws if invitation is expired', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      pmsId: 3, pmsName: 'SiteMinder', organizationId: 5,
      harvestStatus: 'pending', harvestedData: null,
      session: null,
    } as any);
    await expect(initSession('tok')).rejects.toThrow('expired');
  });

  it('creates session and marks invitation used', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: futureDate,
      pmsId: 3, pmsName: 'SiteMinder', organizationId: 5,
      harvestStatus: 'pending', harvestedData: null,
      session: null,
    } as any);
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
    vi.mocked(prisma.onboardingSession.create).mockResolvedValue({ id: 42 } as any);

    const result = await initSession('valid-token');
    expect(prisma.onboardingInvitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { usedAt: expect.any(Date) },
    });
    expect(result.id).toBe(42);
  });

  it('auto-completes ari_source_selection when pmsId is already set', async () => {
    vi.mocked(prisma.onboardingInvitation.findUnique).mockResolvedValue({
      id: 1, revokedAt: null, usedAt: null,
      expiresAt: futureDate,
      pmsId: 3, pmsName: 'SiteMinder', organizationId: 5,
      harvestStatus: 'pending', harvestedData: null,
      session: null,
    } as any);
    vi.mocked(prisma.onboardingInvitation.update).mockResolvedValue({} as any);
    vi.mocked(prisma.onboardingSession.create).mockResolvedValue({ id: 42 } as any);

    await initSession('valid-token');

    const createCall = vi.mocked(prisma.onboardingSession.create).mock.calls[0]![0];
    const steps = createCall.data.stepsJson as Array<{ id: string; status: string }>;
    const ariStep = steps.find(s => s.id === 'ari_source_selection');
    expect(ariStep?.status).toBe('completed');
  });
});

describe('advanceStep', () => {
  it('increments currentStep', async () => {
    vi.mocked(prisma.onboardingSession.findUnique).mockResolvedValue({
      id: 1, currentStep: 1, stepsJson: [{ id: 'candidate_search', status: 'completed' }, { id: 'harvest_data', status: 'pending' }],
      enrichedData: null,
    } as any);
    vi.mocked(prisma.onboardingSession.update).mockResolvedValue({ currentStep: 2 } as any);
    await advanceStep(1, 1, { stepId: 'harvest_data', success: true });
    expect(prisma.onboardingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });
});
