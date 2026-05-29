import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const TEAMSYSTEM_PMS_ID = 93;

// TeamSystem / Figaro onboarding flow (KB-verified, certified 2024-05-15):
// TeamSystem and Figaro are the same technology — always use source "TeamSystem".
// - No credential needed for shell creation
// - HG creates property first; then hotel sets HG as a channel in their TeamSystem account
// - Room/rate codes MUST match between HG and TeamSystem
// - hotelCode (property ID) must be a NUMBER — letters are not accepted
// - VCC: MUST be managed in HyperGuest back office (TeamSystem cannot store CC details)
//   The 2nd VCC checkbox in back office settings must always be LEFT UNMARKED
//   Hotel must be explained how to view VCC details in HyperGuest
// - Reservation flow: HG pings TeamSystem, then TeamSystem pulls reservations from HG
// Support: s.biserni@teamsystem.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Set HyperGuest as a Channel in TeamSystem',
    description: 'Now that your HyperGuest property profile is created, go to your TeamSystem account and add HyperGuest as a distribution channel. Important: payment card details cannot be stored in TeamSystem — your HyperGuest contact will configure VCC access in HyperGuest so you can view card details there. Once done, click Continue.',
  });
  return steps;
}

export const teamSystemFlow = createVendorFlow({
  pmsId: TEAMSYSTEM_PMS_ID,
  pmsName: 'TeamSystem',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    // hotelCode MUST be a number — letters not accepted
    hotelCode: z.string().regex(/^\d+$/, 'TeamSystem Hotel Code must be a number (digits only)'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['hotelCode']) return { valid: false, message: 'TeamSystem Hotel Code is required (must be numeric)' };
    if (!/^\d+$/.test(ctx.credentials['hotelCode'])) return { valid: false, message: 'TeamSystem Hotel Code must contain digits only' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: TEAMSYSTEM_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['hotelCode'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['hotelCode'], hasStaticData: false,
      },
    };
  },
});
