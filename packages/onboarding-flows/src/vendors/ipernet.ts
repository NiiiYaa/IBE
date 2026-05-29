import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const IPERNET_PMS_ID = 40;

// iper.net onboarding flow (KB-verified):
// 1. Hotel provides their iper.net Channel Manager ID
// 2. Hotel maps the property in iper.net on their side (iper.net does the mapping)
// 3. HG creates the property shell using the Channel Manager ID
// requiresStaffChannelSetup: false
// Support: supporto@iperbooking.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Map HyperGuest in iper.net',
    description: 'Log in to your iper.net account and map HyperGuest as a channel using your Channel Manager ID. Once mapped, iper.net will begin pushing availability and rates. Click Continue when done.',
  });
  return steps;
}

export const ipernetFlow = createVendorFlow({
  pmsId: IPERNET_PMS_ID,
  pmsName: 'iper.net',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({
    channelManagerId: z.string().min(1, 'iper.net Channel Manager ID is required — contact supporto@iperbooking.com if you do not have it'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['channelManagerId']) return { valid: false, message: 'iper.net Channel Manager ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: IPERNET_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['channelManagerId'],
        hasStaticData: false,
      },
    };
  },
});
