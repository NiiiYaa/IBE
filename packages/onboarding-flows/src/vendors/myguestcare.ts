import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const MYGUESTCARE_PMS_ID = 73;

// MyGuestCare onboarding flow (KB-verified):
// Standard blank flow. Content collected via IBE harvesting.
// IMPORTANT: Price type is MANDATORY. Per occupancy is the default.
//   Must verify with the property which pricing model they use before setup.
// Support: assistenza@myguestcare.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in MyGuestCare',
    description: 'In your MyGuestCare account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const myGuestCareFlow = createVendorFlow({
  pmsId: MYGUESTCARE_PMS_ID,
  pmsName: 'MyGuestCare',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  // Pricing model is mandatory — per_occupancy is default but must verify with hotel
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'MyGuestCare Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'MyGuestCare Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: MYGUESTCARE_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        // Per occupancy is default — verify with hotel during cm_settings step
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_occupancy' },
        propertyCode: ctx.credentials['propertyId'], hasStaticData: false,
      },
    };
  },
});
