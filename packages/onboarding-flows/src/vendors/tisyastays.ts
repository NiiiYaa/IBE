import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const TISYA_STAYS_PMS_ID = 161;

// Tisya Stays onboarding flow — no KB article found; built from standard template.
// kbVerified: false — verify credentials and connection steps with Tisya Stays support before production use.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Tisya Stays',
    description: 'In your Tisya Stays account, activate the HyperGuest channel. Once done, click Continue.',
  });
  return steps;
}

export const tisyaStaysFlow = createVendorFlow({
  pmsId: TISYA_STAYS_PMS_ID,
  pmsName: 'Tisya Stays',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({}),
  steps: buildSteps(),
  async validateConnection(_ctx) { return { valid: true }; },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: TISYA_STAYS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
