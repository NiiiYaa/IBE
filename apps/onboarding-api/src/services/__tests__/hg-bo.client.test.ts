import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';
import { HGBoClient } from '../hg-bo.client.js';

const client = new HGBoClient('https://back-office.dev.hyperguest.io', 'test-key');

beforeEach(() => { vi.clearAllMocks(); });

function mockResponse(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);
}

describe('createProperty', () => {
  it('POSTs to /api/v1/integration/properties and returns propertyCode', async () => {
    mockResponse({ property: { propertyCode: 'SM-001' } });
    const result = await client.createProperty({
      property: { name: 'Test Hotel', pmsId: 3, location: { city: { name: 'London', countryCode: 'GB' } }, isPilot: true, status: 'Incomplete' },
      propertySource: { data: { propertyId: 'SM-001' }, propertyCode: 'SM-001' },
    });
    expect(result.property.propertyCode).toBe('SM-001');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://back-office.dev.hyperguest.io/api/v1/integration/properties/',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }) })
    );
  });
});

describe('triggerAriSync', () => {
  it('POSTs to trigger-update endpoint', async () => {
    mockResponse({ ok: true });
    await client.triggerAriSync('SM-001');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://back-office.dev.hyperguest.io/api/v1/integration/properties/SM-001/trigger-update',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
