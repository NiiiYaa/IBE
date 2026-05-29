import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const HOTELAVAILABILITIES_PMS_ID = 106;

// HotelAvailabilities onboarding flow (KB-verified):
// 1. Hotel provides their HotelAvailabilities property ID
// 2. HG creates the property shell using that ID
// 3. Room and rate codes must match exactly (HotelAvailabilities support shares a file with codes)
// requiresStaffChannelSetup: false
// Support: support@hotelavailabilities.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in HotelAvailabilities',
    description: 'HyperGuest will create your property shell using your HotelAvailabilities ID. Room and rate codes must match exactly with those provided by HotelAvailabilities support. Click Continue once HyperGuest has confirmed the setup.',
  });
  return steps;
}

export const hotelAvailabilitiesFlow = createVendorFlow({
  pmsId: HOTELAVAILABILITIES_PMS_ID,
  pmsName: 'HotelAvailabilities',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'HotelAvailabilities Property ID is required — contact support@hotelavailabilities.com if you do not have it'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'HotelAvailabilities Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: HOTELAVAILABILITIES_PMS_ID,
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
