import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const ROOMRACCOON_PMS_ID = 127;

// RoomRaccoon onboarding flow (KB-verified):
// IMPORTANT: Do NOT use underscores (_) in room codes — use hyphens (-) instead.
// Underscores cause ARI push failures in RoomRaccoon.
// Correct: DELUXE-ROOM  |  Incorrect: DELUXE_ROOM

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in RoomRaccoon',
    description: 'In your RoomRaccoon account, go to Channel Manager → New Channel and add HyperGuest using your HyperGuest property code. Once the channel is active, click Continue.',
  });
  return steps;
}

export const roomRaccoonFlow = createVendorFlow({
  pmsId: ROOMRACCOON_PMS_ID,
  pmsName: 'RoomRaccoon',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  // Room codes must use hyphens, not underscores — enforced in cm_settings validation
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'RoomRaccoon Hotel ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'RoomRaccoon Hotel ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: ROOMRACCOON_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
