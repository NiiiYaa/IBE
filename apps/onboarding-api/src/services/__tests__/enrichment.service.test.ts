import { describe, it, expect } from 'vitest';
import { buildEnrichedData } from '../enrichment.service.js';

describe('buildEnrichedData', () => {
  it('merges invitation metadata with credentials', () => {
    const result = buildEnrichedData({
      hotelName: 'Grand Hotel',
      websiteUrl: 'https://grand.com',
      contactEmail: 'info@grand.com',
      credentials: { channelManagerCode: 'CM-123' },
    });
    expect(result.hotelName).toBe('Grand Hotel');
    expect(result.websiteUrl).toBe('https://grand.com');
    expect(result.credentials.channelManagerCode).toBe('CM-123');
  });

  it('provides defaults when invitation metadata is missing', () => {
    const result = buildEnrichedData({
      hotelName: null,
      websiteUrl: null,
      contactEmail: null,
      credentials: { channelManagerCode: 'X' },
    });
    expect(result.hotelName).toBe('');
    expect(result.city).toBe('');
    expect(result.countryCode).toBe('');
  });
});
