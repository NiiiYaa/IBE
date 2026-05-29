import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const SABEEAPP_PMS_ID = 96;

// SabeeApp onboarding flow (KB-verified, certified 30/05/25):
// - NO credential needed from hotel for HG to create the shell
// - SabeeApp pushes ARI to HG
// - Children are sold as adults (no separate children pricing)
// - Dormitories: each bed = one room (max occupancy 1), room count = total beds available
// - No static data pull available

function buildSteps() {
  const steps = defaultStepsFor('blank');
  // Remove collect_credentials — no credential needed
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in SabeeApp',
    description: 'In your SabeeApp account, go to Channel Manager and add HyperGuest as a new channel using your HyperGuest property code. Once the channel is active, click Continue.',
  });
  return steps;
}

export const sabeeAppFlow = createVendorFlow({
  pmsId: SABEEAPP_PMS_ID,
  pmsName: 'SabeeApp',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({}), // No credentials needed — SabeeApp connects to HG by itself
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true }; // No credential to validate
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: SABEEAPP_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '', // SabeeApp uses HG property ID internally; set after property creation
        hasStaticData: false,
      },
    };
  },
});
