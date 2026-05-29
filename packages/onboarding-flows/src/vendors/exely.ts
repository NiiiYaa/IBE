import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const EXELY_PMS_ID = 160;

// Exely onboarding flow — no KB article found; built from standard template.
// kbVerified: false — verify credentials and connection steps with Exely support before production use.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Exely',
    description: 'In your Exely account, activate the HyperGuest channel. Once done, click Continue.',
  });
  return steps;
}

export const exelyFlow = createVendorFlow({
  pmsId: EXELY_PMS_ID,
  pmsName: 'Exely',
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
        pmsId: EXELY_PMS_ID,
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
