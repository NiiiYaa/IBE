import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const LOBBYPMS_PMS_ID = 146;

// LobbyPMS onboarding flow (KB-verified):
// - Content collected via IBE harvesting in the wizard
// - Uses HG default room/rate codes — no code matching needed
// - NO children/infants support: all child/infant occupancies must be set to 0
// - Age configuration in General tab: if hotel doesn't charge different prices for children:
//   set Infant age = 1, Children age = 2 (ensures no search combinations are left without results)
// - Only adult prices are received from LobbyPMS

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in LobbyPMS',
    description: 'In your LobbyPMS account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Note: children and infants are not supported — only adult prices will be received. Once done, click Continue.',
  });
  return steps;
}

export const lobbyPmsFlow = createVendorFlow({
  pmsId: LOBBYPMS_PMS_ID,
  pmsName: 'LobbyPMS',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  useDefaultCodes: true, // LobbyPMS uses HG's own room/rate codes for mapping
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'LobbyPMS Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'LobbyPMS Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: LOBBYPMS_PMS_ID,
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
