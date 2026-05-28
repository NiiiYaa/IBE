import { describe, it, expect } from 'vitest';
import { lookupTaxes } from '../tax-lookup.service.js';
import type { HarvestedFee } from '@ibe/onboarding-flows';

describe('lookupTaxes', () => {
  it('returns VAT + city tax for a known country+city', () => {
    const fees = lookupTaxes('Netherlands', 'Amsterdam');
    expect(fees.length).toBeGreaterThan(0);
    fees.forEach((f: HarvestedFee) => expect(f.source).toBe('lookup'));
    const vat = fees.find((f: HarvestedFee) => f.name.toLowerCase().includes('vat'));
    expect(vat).toBeDefined();
    const city = fees.find((f: HarvestedFee) => f.name.toLowerCase().includes('city') || f.name.toLowerCase().includes('tourist'));
    expect(city).toBeDefined();
  });

  it('returns at least country-level VAT for an unknown city', () => {
    const fees = lookupTaxes('Netherlands', 'Zutphen');
    expect(fees.length).toBeGreaterThan(0);
    const vat = fees.find((f: HarvestedFee) => f.name.toLowerCase().includes('vat'));
    expect(vat).toBeDefined();
  });

  it('returns empty array for a completely unknown country', () => {
    const fees = lookupTaxes('Atlantis', 'Lost City');
    expect(fees).toEqual([]);
  });
});
