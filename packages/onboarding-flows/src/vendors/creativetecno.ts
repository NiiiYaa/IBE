import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const CREATIVETECNO_PMS_ID = 92;

// Creativetecno onboarding flow (KB-verified):
// - Standard supply chain integration (generic HG-spec API)
// - Handled like a direct Booking.com supply integration
// - No credentials needed from hotel
// - Support: alejandro@creativetecno.com (Alejandro Dominguez)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Creativetecno',
    description: 'In your Creativetecno account, activate the HyperGuest channel. Once done, click Continue.',
  });
  return steps;
}

export const creativetecnoFlow = createVendorFlow({
  pmsId: CREATIVETECNO_PMS_ID,
  pmsName: 'Creativetecno',
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
        pmsId: CREATIVETECNO_PMS_ID,
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
