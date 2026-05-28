import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));

vi.mock('@ibe/shared', () => ({
  detectKnownIBE: vi.fn(),
}));

import { withStealthPage } from '../playwright-browser.service.js';
import { detectKnownIBE } from '@ibe/shared';
import { resolveIbeUrl } from '../ibe-resolver.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('resolveIbeUrl — Tier 1', () => {
  it('returns immediately when detectKnownIBE matches', async () => {
    vi.mocked(detectKnownIBE).mockReturnValue({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
      bookingTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
    });
    const result = await resolveIbeUrl('https://be.synxis.com/?hotel=HOTEL1&chain=ABC');
    expect(result).toEqual({ ibeName: 'Sabre SynXis', ibeUrl: 'https://be.synxis.com/?hotel=HOTEL1&chain=ABC', hotelId: 'HOTEL1' });
    expect(withStealthPage).not.toHaveBeenCalled();
  });
});

describe('resolveIbeUrl — Tier 3 browser', () => {
  it('launches browser when Tier 1 misses', async () => {
    vi.mocked(detectKnownIBE).mockReturnValue(null);
    vi.mocked(withStealthPage).mockResolvedValue(null);
    const result = await resolveIbeUrl('https://grandhotel.com');
    expect(withStealthPage).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('returns resolved IBE found via booking button href', async () => {
    // First call (direct URL): no match
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null);
    // Second call (on href): match
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://reservations.grandhotel.com/?hotel=HOTEL1',
      bookingTemplate: 'https://reservations.grandhotel.com/?hotel=HOTEL1',
    });

    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://grandhotel.com',
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://reservations.grandhotel.com/?hotel=HOTEL1&chain=ABC']),
        goto: vi.fn(),
      };
      return fn(mockPage as any);
    });

    const result = await resolveIbeUrl('https://grandhotel.com');
    expect(result).toMatchObject({ ibeName: 'Sabre SynXis', hotelId: 'HOTEL1' });
  });
});
