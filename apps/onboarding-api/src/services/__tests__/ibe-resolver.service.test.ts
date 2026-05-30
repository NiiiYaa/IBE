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

describe('resolveIbeUrl — multi-source candidate collection', () => {
  it('finds IBE via <button data-href>', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null) // initial URL
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Profitroom',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://booking.profitroom.com/HOTEL1',
      bookingTemplate: 'https://booking.profitroom.com/HOTEL1',
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://hotel.com',
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://booking.profitroom.com/HOTEL1']),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('timeout')),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('timeout')) }),
      }
      return fn(mockPage as any)
    })
    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Profitroom' })
  })

  it('finds IBE via iframe src', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null)
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Cloudbeds',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://hotels.cloudbeds.com/reservation/HOTEL1',
      bookingTemplate: 'https://hotels.cloudbeds.com/reservation/HOTEL1',
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://hotel.com',
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://hotels.cloudbeds.com/reservation/HOTEL1']),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('timeout')),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('timeout')) }),
      }
      return fn(mockPage as any)
    })
    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Cloudbeds' })
  })

  it('finds IBE via URL-pattern href (icon button, no text)', async () => {
    vi.mocked(detectKnownIBE).mockReturnValueOnce(null)
    vi.mocked(detectKnownIBE).mockReturnValueOnce({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
      bookingTemplate: 'https://be.synxis.com/?hotel=HOTEL1',
    })
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        url: () => 'https://hotel.com',
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(['https://be.synxis.com/?hotel=HOTEL1&chain=ABC']),
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('timeout')),
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('timeout')) }),
      }
      return fn(mockPage as any)
    })
    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Sabre SynXis' })
  })
})

describe('resolveIbeUrl — click-and-observe fallback', () => {
  it('clicks a booking button when fast scan finds nothing, returns navigated URL', async () => {
    vi.mocked(detectKnownIBE)
      .mockReturnValueOnce(null) // initial URL (line 13)
      .mockReturnValueOnce(null) // hop loop checks initial URL (line 232)
      .mockReturnValueOnce({     // clickAndObserve iframe result (line 271)
        name: 'Mews',
        externalHotelId: 'MEWS1',
        searchTemplate: 'https://app.mews.com/distributor/MEWS1',
        bookingTemplate: 'https://app.mews.com/distributor/MEWS1',
      })

    const mockClick = vi.fn().mockResolvedValue(undefined)
    const mockEl = { click: mockClick, isVisible: vi.fn().mockResolvedValue(true), boundingBox: vi.fn().mockResolvedValue({ y: 100 }) }

    const mockEvaluate = vi.fn()
      .mockResolvedValueOnce([])    // scanPageResources — empty resource list
      .mockResolvedValueOnce([])    // collectBookingCandidates — empty candidates, breaks hop loop
      .mockResolvedValueOnce(true)  // clickAndObserve — finds and clicks element
      .mockResolvedValueOnce(null)  // clickAndObserve iframe scan — no new iframe

    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      let urlCallCount = 0
      const mockPage = {
        url: vi.fn().mockImplementation(() => {
          // First url() call returns initial URL, subsequent calls return about:blank (simulating no navigation/popup)
          return urlCallCount++ === 0 ? 'https://hotel.com' : 'about:blank'
        }),
        waitForTimeout: vi.fn(),
        goto: vi.fn(),
        evaluate: mockEvaluate,
        $: vi.fn().mockResolvedValue(null),
        $$: vi.fn().mockResolvedValue([mockEl]),
        waitForNavigation: vi.fn().mockRejectedValue(new Error('no navigation')), // Reject, forcing fallthrough to iframe check
        context: () => ({ waitForEvent: vi.fn().mockRejectedValue(new Error('no popup')) }),
      }
      return fn(mockPage as any)
    })

    const result = await resolveIbeUrl('https://hotel.com')
    expect(result).toMatchObject({ ibeName: 'Mews' })
    // Verify click-and-observe path was taken: evaluate must have been called 4 times
    // (scanPageResources, collectBookingCandidates, clickAndObserve click, clickAndObserve iframe scan)
    expect(mockEvaluate).toHaveBeenCalledTimes(4)
  })
})
