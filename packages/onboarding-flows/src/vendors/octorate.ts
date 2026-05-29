import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const OCTORATE_PMS_ID = 142;

// Octorate onboarding flow (KB-verified, certified 1/07/24):
// - No credential needed for shell creation
// - No static data from Octorate — hotel created manually on both ends
// - No rooms/rates retrieved; no code matching needed
// - They push ARI to HG; HG pushes reservations to them
// - Generic PMS integration (developed by Octorate to HG's spec)
// Support: development@octorate.com | f.scuppa@octorate.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Octorate',
    description: 'In your Octorate account, activate HyperGuest as a channel. Once done, click Continue.',
  });
  return steps;
}

export const octoRateFlow = createVendorFlow({
  pmsId: OCTORATE_PMS_ID,
  pmsName: 'Octorate',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({}),
  steps: buildSteps(),
  async validateConnection(_ctx) { return { valid: true }; },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: OCTORATE_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '', hasStaticData: false,
      },
    };
  },
});
