import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const STAAH_V2_PMS_ID = 169;

// STAAH V2 onboarding flow (KB-verified, certified 20/08/25):
// - NEW standard for all STAAH onboardings (V1 is deprecated)
// - No credential needed for HG to create the shell
// - STAAH pushes ARI to HG; STAAH pulls mapping from HG
// - Room-rate combinations MUST be unique per property to avoid STAAH mapping conflicts
//   e.g. if two properties both have ROOM-01 + EP, STAAH may confuse them
//   → use the room name or property-specific prefix in codes
// - Default price model: Per Person (must change if property wants per room)
//   Always reset ARI after changing the price model
// - Hotel can onboard and map channels directly in their STAAH dashboard
// Support: ota@staah.com (technical) — do NOT CC hoteliers on this address

function buildSteps() {
  const steps = defaultStepsFor('blank');
  // Remove collect_credentials — no hotel credential needed
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in STAAH',
    description: 'In your STAAH dashboard, go to Channels and locate HyperGuest V2. Activate it and complete the room and rate mapping using the codes configured in the previous step. Once mapping is complete, click Continue.',
  });
  return steps;
}

export const staahV2Flow = createVendorFlow({
  pmsId: STAAH_V2_PMS_ID,
  pmsName: 'STAAH V2',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true, // Hotel can self-activate in STAAH dashboard
  regionAware: false,
  useDefaultCodes: true, // ROOM-01, FLEX-BB etc. but codes must be unique per property
  credentialsSchema: z.object({}), // No credentials needed
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: STAAH_V2_PMS_ID,
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
