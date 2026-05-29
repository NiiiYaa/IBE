import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const DJUBO_PMS_ID = 69;

// DJUBO onboarding flow (no KB article — built generically).
// DJUBO is an India-focused revenue management and channel manager platform.
// Verify credential requirements and connect process before using in production.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in DJUBO',
    description: 'In your DJUBO account, go to Channel Manager → Connections and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const djuboFlow = createVendorFlow({
  pmsId: DJUBO_PMS_ID,
  pmsName: 'DJUBO',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'DJUBO Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'DJUBO Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: DJUBO_PMS_ID,
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
