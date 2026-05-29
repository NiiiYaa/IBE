import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const AXISROOMS_PMS_ID = 48;

// AxisRooms onboarding flow:
// KB article covers removal from masterlist, not new onboarding.
// Connection is managed via HG property ID in the AxisRooms back-office.
// requiresStaffChannelSetup: true — HG staff activates in AxisRooms using HG property ID.
// Support: ar_support@axisrooms.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Confirm AxisRooms Connection',
    description: 'HyperGuest will activate the connection in AxisRooms using your HyperGuest property code. Once your HyperGuest contact confirms the channel is active, click Continue.',
  });
  return steps;
}

export const axisRoomsFlow = createVendorFlow({
  pmsId: AXISROOMS_PMS_ID,
  pmsName: 'AxisRooms',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true, // HG activates in AxisRooms back-office using HG property ID
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'AxisRooms Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'AxisRooms Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: AXISROOMS_PMS_ID,
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
