import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client.js', () => {
  return {
    prisma: {
      ariSourceWhiteLabel: {
        findUnique: vi.fn(),
      },
    },
  };
});

import { prisma } from '../../db/client.js';
import { resolveVendorFlow } from '../flow-resolver.service.js';

describe('resolveVendorFlow', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns the flow for pmsId directly when no WL mapping exists', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue(null);
    const flow = await resolveVendorFlow(12); // SiteMinder has a real flow
    expect(flow).toBeDefined();
    expect(flow?.pmsId).toBe(12);
  });

  it('returns the master flow when a WL mapping exists', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue({
      pmsId: 85,
      whiteLabelOfPmsId: 30, // STAAH
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const flow = await resolveVendorFlow(85);
    expect(flow).toBeDefined();
    expect(flow?.pmsId).toBe(30);
  });

  it('returns undefined when pmsId has no flow and no WL mapping', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue(null);
    const flow = await resolveVendorFlow(99999);
    expect(flow).toBeUndefined();
  });

  it('returns undefined when WL mapping points to an unknown master pmsId', async () => {
    vi.mocked(prisma.ariSourceWhiteLabel.findUnique).mockResolvedValue({
      pmsId: 85,
      whiteLabelOfPmsId: 99999, // no flow exists for 99999
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const flow = await resolveVendorFlow(85);
    expect(flow).toBeUndefined();
  });
});
