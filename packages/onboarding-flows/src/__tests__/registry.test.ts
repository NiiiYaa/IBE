import { describe, it, expect } from 'vitest';
import { getVendorFlow } from '../registry.js';
import { validateVendorFlow } from '../factory.js';
import { siteMinderFlow } from '../vendors/siteminder.js';
import { travelClickFlow } from '../vendors/travelclick.js';

const siteMinderPmsId = siteMinderFlow.pmsId;

describe('vendor registry', () => {
  it('returns SiteMinder flow for its pmsId', () => {
    const flow = getVendorFlow(siteMinderPmsId);
    expect(flow).toBeDefined();
    expect(flow!.pmsName).toBe('SiteMinder');
    expect(flow!.dataFlow).toBe('blank');
    expect(flow!.steps.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown pmsId', () => {
    expect(getVendorFlow(999999)).toBeUndefined();
  });

  it('SiteMinder credentials schema requires propertyId', () => {
    const flow = getVendorFlow(siteMinderPmsId)!;
    expect(flow.credentialsSchema.safeParse({ propertyId: 'SM-12345' }).success).toBe(true);
    expect(flow.credentialsSchema.safeParse({ propertyId: '' }).success).toBe(false);
  });

  it('SiteMinder has a user_action step for channel connection', () => {
    const flow = getVendorFlow(siteMinderPmsId)!;
    expect(flow.steps.some(s => s.kind === 'user_action')).toBe(true);
  });

  it('validateVendorFlow passes for SiteMinder', () => {
    expect(() => validateVendorFlow(siteMinderFlow)).not.toThrow();
  });
});

describe('TravelClick vendor flow', () => {
  it('returns TravelClick flow for pmsId 25', () => {
    const flow = getVendorFlow(25);
    expect(flow).toBeDefined();
    expect(flow!.pmsName).toBe('TravelClick');
    expect(flow!.dataFlow).toBe('blank');
    expect(flow!.useDefaultCodes).toBe(true);
  });

  it('TravelClick credentials schema requires propertyId', () => {
    const flow = getVendorFlow(25)!;
    expect(flow.credentialsSchema.safeParse({ propertyId: 'TC-12345' }).success).toBe(true);
    expect(flow.credentialsSchema.safeParse({ propertyId: '' }).success).toBe(false);
    expect(flow.credentialsSchema.safeParse({}).success).toBe(false);
  });

  it('TravelClick has a user_action step for channel connection', () => {
    const flow = getVendorFlow(25)!;
    expect(flow.steps.some(s => s.kind === 'user_action')).toBe(true);
  });

  it('validateVendorFlow passes for TravelClick', () => {
    expect(() => validateVendorFlow(travelClickFlow)).not.toThrow();
  });

  it('TravelClick getHGPropertyPayload includes pmsId 25 and hasStaticData false', () => {
    const flow = getVendorFlow(25)!;
    const payload = flow.getHGPropertyPayload({
      sessionId: 1, pmsId: 25, organizationId: 1,
      credentials: { propertyId: 'TC-999' },
      enrichedData: { hotelName: 'Test Hotel', city: 'Rome', countryCode: 'IT' },
      completedSteps: [],
    });
    expect((payload['property'] as any)['pmsId']).toBe(25);
    expect((payload['propertySource'] as any)['hasStaticData']).toBe(false);
    expect((payload['propertySource'] as any)['propertyCode']).toBe('TC-999');
  });
});
