import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const VIOMA_PMS_ID = 147;

// Vioma onboarding flow (KB-verified):
// - No credentials needed
// - Vioma pulls static data FROM HG (HG has the room/rate codes)
// - Vioma pushes ARI to HG
// - Reservations: HG pushes to Vioma, confirmed immediately
// - No code matching required (Vioma pulls from HG)
// - Support: so@vioma.de (Saskia)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Vioma',
    description: 'In your Vioma account, activate the HyperGuest channel. Vioma will automatically pull your room and rate data from HyperGuest. Once done, click Continue.',
  });
  return steps;
}

export const viomaFlow = createVendorFlow({
  pmsId: VIOMA_PMS_ID,
  pmsName: 'Vioma',
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
        pmsId: VIOMA_PMS_ID,
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
