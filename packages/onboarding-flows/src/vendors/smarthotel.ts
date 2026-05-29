import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const SMARTHOTEL_PMS_ID = 174;

// Smarthotel onboarding flow (KB-verified):
// - No credentials needed for HG to create the shell
// - Property created manually in HG back-office
// - Smarthotel pushes ARI to HG
// - Children/infants: prices are per adult; child/infant is an additional amount (not a separate child rate)
// - Support: connectivity@smarthotel.nl (Matthijs Withaar)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Smarthotel',
    description: 'In your Smarthotel account, activate the HyperGuest channel. Smarthotel will begin pushing availability and rates automatically. Note: child/infant pricing is calculated as an additional amount per adult rate. Once done, click Continue.',
  });
  return steps;
}

export const smarthotelFlow = createVendorFlow({
  pmsId: SMARTHOTEL_PMS_ID,
  pmsName: 'Smarthotel',
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
        pmsId: SMARTHOTEL_PMS_ID,
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
