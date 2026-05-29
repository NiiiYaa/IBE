import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const AOHOSTELS_PMS_ID = 165;

// A&O Hostels onboarding flow (KB-verified, certified 2025-05-29).
// Supply chain + generic CM integration built to HG spec.
// - They push ARI to us; we push reservations to them
// - No credentials needed from hotel
// - Children pricing: children sold at adult rate (no age-range pricing)
// Support: karsten.schneider@aohostels.com

export const aoHostelsFlow = createVendorFlow({
  pmsId: AOHOSTELS_PMS_ID,
  pmsName: 'A&O Hostels',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({}),
  steps: defaultStepsFor('blank'),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: AOHOSTELS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        // Children priced as adults — no age-range pricing available
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '', hasStaticData: false,
      },
    };
  },
});
