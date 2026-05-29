import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const HOST_PMS_ID = 56;

// Host PMS onboarding flow (KB-verified):
// Standard blank flow. Content collected via IBE harvesting.
// IMPORTANT: VCC (virtual credit card) details are NOT transmitted through the
// Host PMS channel manager connection. Full VCC visibility must be enabled in the
// HyperGuest back office so the property can retrieve complete card details directly.
// Ensure this is configured during onboarding to avoid payment issues.
// Support: suporte@hhs.pt

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Host PMS',
    description: 'In your Host PMS account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Note: payment card details are not transmitted through this connection — your HyperGuest contact will configure direct VCC access for you. Once done, click Continue.',
  });
  return steps;
}

export const hostPmsFlow = createVendorFlow({
  pmsId: HOST_PMS_ID,
  pmsName: 'Host PMS',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Host PMS Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Host PMS Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: HOST_PMS_ID,
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
