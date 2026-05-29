import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));
vi.mock('../ibe-resolver.service.js', () => ({
  resolveIbeUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock('../dataforseo.service.js', () => ({
  searchHotelsDataForSEO: vi.fn().mockResolvedValue([]),
}));
const MOCK_BLOCKED = vi.hoisted(() => [
  { domain: 'booking.com',     matchType: 'subdomain', country: null },
  { domain: 'expedia.com',     matchType: 'subdomain', country: null },
  { domain: 'tripadvisor',     matchType: 'brand',     country: null },
  { domain: 'agoda',           matchType: 'brand',     country: null },
  { domain: 'kayak',           matchType: 'brand',     country: null },
  { domain: 'hotels.com',      matchType: 'subdomain', country: null },
]);
vi.mock('../blocked-domains.service.js', () => {
  const CC_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
  function extractBrandLabel(hostname: string) {
    const h = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    const parts = h.split('.');
    if (parts.length === 2) return parts[0];
    if (parts.length === 3 && CC_SLDS.has(parts[1]!)) return parts[0];
    return null;
  }
  function isBlockedByList(url: string, entries: Array<{ domain: string; matchType: string }>) {
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      const parts = hostname.split('.');
      const brandLabel = parts.length === 2 ? parts[0] : parts.length === 3 && CC_SLDS.has(parts[1]!) ? parts[0] : null;
      for (const e of entries) {
        if (e.matchType === 'exact' && hostname === e.domain) return true;
        if (e.matchType === 'subdomain' && (hostname === e.domain || hostname.endsWith('.' + e.domain))) return true;
        if (e.matchType === 'brand' && brandLabel === e.domain) return true;
        if (e.matchType === 'keyword' && hostname.includes(e.domain)) return true;
      }
      return false;
    } catch { return false; }
  }
  return {
    getBlockedDomains: vi.fn().mockResolvedValue(MOCK_BLOCKED),
    getCachedBlockedDomains: vi.fn().mockReturnValue(MOCK_BLOCKED),
    isBlockedByList,
    invalidateBlockedDomainsCache: vi.fn(),
  };
});

import { withStealthPage } from '../playwright-browser.service.js';
import { searchHotelsBrave } from '../hotel-search.service.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('searchHotelsBrave', () => {
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

    const result = await searchHotelsBrave('Grand Hotel', 'Paris', 'France');
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
    const result = await searchHotelsBrave('Nonexistent Hotel', 'Nowhere', 'XX');
    expect(result).toEqual([]);
  });
});
