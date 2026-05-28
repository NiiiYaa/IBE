import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const TRAVELCLICK_PMS_ID = 25;

function buildTravelClickSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in TravelClick',
    description: 'Log in to your TravelClick dashboard and add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const travelClickFlow = createVendorFlow({
  pmsId: TRAVELCLICK_PMS_ID,
  pmsName: 'TravelClick',
  dataFlow: 'blank',
  useDefaultCodes: true,
  requiresStaffChannelSetup: false,
  regionAware: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'TravelClick Property ID is required'),
  }),
  steps: buildTravelClickSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) {
      return { valid: false, message: 'TravelClick Property ID is required' };
    }
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: TRAVELCLICK_PMS_ID,
        location: {
          city: {
            name: (enriched['city'] as string) ?? 'Unknown',
            countryCode: (enriched['countryCode'] as string) ?? 'XX',
          },
        },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId: ctx.credentials['propertyId'],
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
        },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
