import { describe, it, expect } from 'vitest';
import { getVendorFlow } from '../registry.js';
import { validateVendorFlow } from '../factory.js';
import { siteMinderFlow } from '../vendors/siteminder.js';

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
