import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const EGLOBE_PMS_ID = 101;

// eGlobe onboarding flow (no KB article — built generically).
// eGlobe is an India-based hotel technology / channel manager platform.
// Verify credential requirements before production use.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in eGlobe',
    description: 'In your eGlobe account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const eGlobeFlow = createVendorFlow({
  pmsId: EGLOBE_PMS_ID,
  pmsName: 'eGlobe',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'eGlobe Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'eGlobe Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: EGLOBE_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
