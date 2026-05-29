import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const DEDGE_PMS_ID = 20;

// D-EDGE onboarding flow (KB-verified, also known as Availpro):
// - No hotel credential needed for HG to create the shell
// - HG uses fixed credentials when D-EDGE requests mapping:
//   Hotel code: HyperGuest property ID | Login: d-edge | Password: ASEGTQ$TQAW
// - Hotel must REQUEST mapping from D-EDGE (HG cannot initiate this)
// - D-EDGE sends an email to HG with room & rate codes to use
// - HG adjusts room/rate codes to match exactly what D-EDGE sends
// IMPORTANT: D-EDGE does NOT work with Virtual rate plans
//   → always connect the parent rate plan, not virtual ones

function buildSteps() {
  const steps = defaultStepsFor('blank');
  // Remove collect_credentials — no hotel credential needed
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'request_dedge_mapping',
      kind: 'user_action',
      title: 'Request Mapping from D-EDGE',
      description: 'Contact D-EDGE support (support@d-edge.com) and ask them to activate the HyperGuest channel for your property. Once you have made this request, click Continue — HyperGuest will receive a confirmation email from D-EDGE with the room and rate codes.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm D-EDGE Connection',
      description: 'Once D-EDGE has confirmed the activation and HyperGuest has configured your room and rate codes, click Continue to trigger the availability and rates sync.',
    }
  );
  return steps;
}

export const dEdgeFlow = createVendorFlow({
  pmsId: DEDGE_PMS_ID,
  pmsName: 'D-EDGE',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Request HyperGuest mapping from D-EDGE',
      instruction: 'Contact D-EDGE support and ask them to activate the HyperGuest channel for your property. Once you submit the request, D-EDGE will send a confirmation email to HyperGuest with your room and rate codes. HyperGuest cannot initiate this — it must come from you. Note: D-EDGE does not support Virtual rate plans; always use parent rate plans.',
      contactEmail: 'support@d-edge.com',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({}), // No hotel credential — HG uses fixed D-EDGE credentials
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: DEDGE_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // HyperGuest property ID is used as the hotel code by D-EDGE
        // D-EDGE handles the mapping on their side
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
