import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const BUSY_ROOMS_PMS_ID = 72;

// Busy Rooms onboarding flow (KB-verified, certified 2/07/23):
// - Specific Busy Rooms CM property ID required (their ID, not HG's)
// - No credentials needed for shell creation
// - CM provides basic room/rate configuration
// - They push ARI to HG; HG pushes reservations to them (confirmed immediately)
// Support: support@busy-rooms.com | support@addajet.atlassian.net (Saurajeet)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Busy Rooms',
    description: 'In your Busy Rooms account, add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const busyRoomsFlow = createVendorFlow({
  pmsId: BUSY_ROOMS_PMS_ID,
  pmsName: 'Busy Rooms',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Busy Rooms Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Busy Rooms Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: BUSY_ROOMS_PMS_ID,
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
