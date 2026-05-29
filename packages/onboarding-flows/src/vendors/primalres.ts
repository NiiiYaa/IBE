import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const PRIMALRES_PMS_ID = 163;

// Primalres onboarding flow (KB-verified):
// - No credentials needed
// - IMPORTANT: Only hotels working with Alpitour are eligible
//   (Primalres distributes exclusively via Alpitour / HyperGuest white-label)
// - Primalres pulls ARI from HG (model URL: hcm.hyperguest.io/models/primalres)
// - No code matching required
// - Support: connectivity@primal-res.com, isaak@primal-res.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Primalres',
    description: 'In your Primalres account, activate the HyperGuest channel (which appears as Alpitour). Primalres will automatically pull availability and rates from HyperGuest. Note: this integration is available exclusively for properties working with Alpitour. Once done, click Continue.',
  });
  return steps;
}

export const primalresFlow = createVendorFlow({
  pmsId: PRIMALRES_PMS_ID,
  pmsName: 'Primalres',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({}),
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: PRIMALRES_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
