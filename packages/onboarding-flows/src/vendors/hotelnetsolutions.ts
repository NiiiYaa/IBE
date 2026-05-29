import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const HOTELNETSOLUTIONS_PMS_ID = 89;

// HotelNetSolutions onboarding flow (KB-verified, certified July 2024):
// - No credential needed for HG to create the shell
// - Hotel must enable HyperGuest in HotelNetSolutions before the connection can be set up
// - They push ARI to HG; no code matching needed (they have their own mapping schema)
// - No rooms/rates retrieved from source — created manually in HG
// - Children supported via age range (HG mimics with 2 groups)
// - Multi-room bookings appear as separate reservations on their end
// Support: ziesack@hotelnetsolutions.de

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Activate HyperGuest in HotelNetSolutions',
    description: 'In your HotelNetSolutions account, enable HyperGuest as a channel. Once activated, HotelNetSolutions will begin pushing availability and rates to HyperGuest. Click Continue when the channel is active.',
  });
  return steps;
}

export const hotelNetSolutionsFlow = createVendorFlow({
  pmsId: HOTELNETSOLUTIONS_PMS_ID,
  pmsName: 'HotelNetSolutions',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({}), // No credential needed to create shell
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: HOTELNETSOLUTIONS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // No credential needed; HotelNetSolutions manages their own mapping schema
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
