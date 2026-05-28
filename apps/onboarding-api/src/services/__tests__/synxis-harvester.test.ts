import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(),
}));
vi.mock('../tax-lookup.service.js', () => ({
  lookupTaxes: vi.fn().mockReturnValue([{ name: 'VAT', amount: '9%', notes: null, source: 'lookup' }]),
}));
vi.mock('@ibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ibe/shared')>();
  return {
    ...actual,
    detectKnownIBE: vi.fn().mockReturnValue({
      name: 'Sabre SynXis',
      externalHotelId: 'HOTEL1',
      searchTemplate: 'https://be.synxis.com/?adult={adults}&arrive={checkIn}&chain=ABC&child=0&depart={checkOut}&hotel=HOTEL1&level=hotel&locale=en-US',
      bookingTemplate: 'https://be.synxis.com/?adult={adults}&arrive={checkIn}&chain=ABC',
    }),
  };
});

import { withStealthPage } from '../playwright-browser.service.js';
import { SynXisHarvester } from '../harvesters/synxis-harvester.js';

function mockPage(rooms: Array<{ name: string; boardLabels: string[] }>) {
  return {
    url: () => 'https://be.synxis.com/?hotel=HOTEL1&chain=ABC&arrive=2026-07-01&depart=2026-07-02&adult=2&child=0',
    waitForSelector: vi.fn(),
    waitForTimeout: vi.fn(),
    goto: vi.fn(),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    evaluate: vi.fn().mockImplementation(() => {
      return Promise.resolve(rooms.map(r => ({
        name: r.name,
        description: 'A comfortable room',
        images: ['https://example.com/img.jpg'],
        bedConfiguration: '1 King bed',
        amenities: ['WiFi'],
        rateOptions: r.boardLabels.map(label => ({
          boardLabel: label,
          cancelText: label.toLowerCase().includes('non') ? 'Non-Refundable' : 'Free cancellation until 3 days before',
          price: '150',
        })),
      })));
    }),
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('SynXisHarvester.harvest', () => {
  it('returns HarvestedHotelData with rooms and rate plan types', async () => {
    const rooms = [
      { name: 'Standard Double', boardLabels: ['Bed & Breakfast', 'Non-Refundable Bed & Breakfast'] },
      { name: 'Superior King', boardLabels: ['Room Only'] },
    ];

    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => fn(mockPage(rooms) as any));

    const harvester = new SynXisHarvester();
    const result = await harvester.harvest(
      'https://be.synxis.com/?hotel=HOTEL1&chain=ABC',
      { checkIn: '2026-07-01', checkOut: '2026-07-02' },
      vi.fn()
    );

    expect(result.rooms.length).toBeGreaterThan(0);
    expect(result.discoveredRatePlanTypes.length).toBeGreaterThan(0);
    const bb = result.discoveredRatePlanTypes.find(r => r.boardCode === 'BB');
    expect(bb).toBeDefined();
    expect(result.taxesAndFees[0]?.source).toBe('lookup');
  });

  it('deduplicates rooms seen in multiple passes', async () => {
    const rooms = [{ name: 'Standard Double', boardLabels: ['Room Only'] }];
    vi.mocked(withStealthPage).mockImplementation(async (_url, fn) => fn(mockPage(rooms) as any));

    const harvester = new SynXisHarvester();
    const result = await harvester.harvest(
      'https://be.synxis.com/?hotel=HOTEL1&chain=ABC',
      { checkIn: '2026-07-01', checkOut: '2026-07-02' },
      vi.fn()
    );

    const names = result.rooms.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
