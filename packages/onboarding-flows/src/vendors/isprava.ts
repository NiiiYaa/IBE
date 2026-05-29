import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const ISPRAVA_PMS_ID = 85;

// Isprava OTA Switch onboarding flow:
// Isprava is a luxury villa rental company that connects via STAAH OTA Switch (pmsId=85).
// Internally treated the same as STAAH for configuration purposes.
// No dedicated KB article — follows STAAH OTA Switch process.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Isprava',
    description: 'In your Isprava / STAAH account, activate HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const ispravaFlow = createVendorFlow({
  pmsId: ISPRAVA_PMS_ID,
  pmsName: 'Isprava',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: false,
  useDefaultCodes: true, // Follows STAAH OTA Switch pattern
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
        pmsId: ISPRAVA_PMS_ID,
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
