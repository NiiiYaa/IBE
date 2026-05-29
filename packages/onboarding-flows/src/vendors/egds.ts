import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const EGDS_PMS_ID = 120;

// e-GDS onboarding flow (kbVerified: true):
// - Channel Manager ID (propertyId) required
// - HyperGuest creates property using e-GDS ID; can use B.com URL if available, blank if no B.com profile
// - Room and rate codes must match between e-GDS and HyperGuest
// - Support: support@e-gds.com

function buildSteps() {
  const steps = defaultStepsFor('blank');

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Activate HyperGuest Channel in e-GDS',
    description: 'HyperGuest will create your property using your e-GDS ID. Room and rate codes must match between e-GDS and HyperGuest. Click Continue once HyperGuest confirms the channel is active.',
  });
  return steps;
}

export const egdsFlow = createVendorFlow({
  pmsId: EGDS_PMS_ID,
  pmsName: 'e-GDS',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'e-GDS Property ID is required — contact support@e-gds.com if you do not have it'),
  }),
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: EGDS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
