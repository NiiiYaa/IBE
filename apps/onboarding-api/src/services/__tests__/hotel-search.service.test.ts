import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));
vi.mock('../ibe-resolver.service.js', () => ({
  resolveIbeUrl: vi.fn().mockResolvedValue(null),
}));

import { withStealthPage } from '../playwright-browser.service.js';
import { searchHotels } from '../hotel-search.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('searchHotels', () => {
  it('returns candidates filtered of known OTAs', async () => {
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue([
          { url: 'https://grandhotel.com', title: 'Grand Hotel — Official Site' },
          { url: 'https://www.booking.com/hotel/grand', title: 'Grand Hotel on Booking.com' },
          { url: 'https://grandhotelresort.com', title: 'Grand Hotel Resort' },
        ]),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('img')),
        goto: vi.fn(),
        $: vi.fn().mockResolvedValue(null),
        click: vi.fn(),
      };
      return fn(mockPage as any);
    });

    const result = await searchHotels('Grand Hotel', 'Paris', 'France');
    const urls = result.map(c => c.url);
    expect(urls).not.toContain('https://www.booking.com/hotel/grand');
    expect(urls.some(u => u.includes('grandhotel'))).toBe(true);
  });

  it('returns empty array when no results found', async () => {
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => {
      const mockPage = {
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue([]),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
        goto: vi.fn(),
        $: vi.fn().mockResolvedValue(null),
      };
      return fn(mockPage as any);
    });
    const result = await searchHotels('Nonexistent Hotel', 'Nowhere', 'XX');
    expect(result).toEqual([]);
  });
});
