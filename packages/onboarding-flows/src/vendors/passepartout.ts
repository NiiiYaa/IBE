import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const PASSEPARTOUT_PMS_ID = 50;

// Passepartout onboarding flow (no KB article — built generically).
// Passepartout is an Italian hotel management / PMS system.
// Verify credential requirements before production use.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Passepartout',
    description: 'In your Passepartout account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const passepartoutFlow = createVendorFlow({
  pmsId: PASSEPARTOUT_PMS_ID,
  pmsName: 'Passepartout',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Passepartout Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Passepartout Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: PASSEPARTOUT_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'], hasStaticData: false,
      },
    };
  },
});
