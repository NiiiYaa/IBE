import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const HOTETEC_PMS_ID = 64;

// Hotetec onboarding flow (KB-verified):
// - Hotetec property ID required (requested from the CM)
// - The ID must match between Hotetec and HyperGuest for correct ARI
//   (Some properties use the Hotetec ID as-is; others may need it modified to match HG's ID)
//   Always verify with Hotetec which format applies before creating the shell.
// Support: soporte@hotetec.com | connectivity@hotetec.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Hotetec',
    description: 'In your Hotetec account, add HyperGuest as a channel and complete the mapping using the codes configured in the previous step. The property ID used here must match what HyperGuest has on file. Once done, click Continue.',
  });
  return steps;
}

export const hotetecFlow = createVendorFlow({
  pmsId: HOTETEC_PMS_ID,
  pmsName: 'Hotetec',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Hotetec Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Hotetec Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: HOTETEC_PMS_ID,
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
