import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ibe-resolver.service.js', () => ({
  resolveIbeUrl: vi.fn(),
}));

import { resolveIbeUrl } from '../ibe-resolver.service.js';
import { harvestFromUrl } from '../ibe-harvester.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('harvestFromUrl', () => {
  it('throws when IBE cannot be resolved', async () => {
    vi.mocked(resolveIbeUrl).mockResolvedValue(null);
    await expect(harvestFromUrl('https://unknown.com', vi.fn())).rejects.toThrow('unresolved');
  });

  it('throws when no harvester registered for the IBE', async () => {
    vi.mocked(resolveIbeUrl).mockResolvedValue({
      ibeName: 'UnknownIBE', ibeUrl: 'https://unknown.com', hotelId: null,
    });
    await expect(harvestFromUrl('https://unknown.com', vi.fn())).rejects.toThrow('No harvester');
  });
});
