import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const MINI_HOTEL_PMS_ID = 44;

// Mini Hotel onboarding flow (KB-verified):
// - Mini Hotel Property ID required
// - Default rate plans are created automatically and are the ONLY ones that can be mapped
//   No other rate plan types are supported in this integration
// - HG must grant access to the Mini Hotel LATAM org (org ID: 53439) so they can see properties
// - requiresStaffChannelSetup: true — HG must grant org access
// Support: soporte@minihotel.io (LATAM) | support@minihotelpms.com (non-LATAM)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Confirm Mini Hotel Connection',
    description: 'HyperGuest will activate the connection in Mini Hotel and grant the necessary access. Only the default rate plans will be mapped — no additional rate plan types are supported. Once your HyperGuest contact confirms the channel is active, click Continue.',
  });
  return steps;
}

export const miniHotelFlow = createVendorFlow({
  pmsId: MINI_HOTEL_PMS_ID,
  pmsName: 'Mini Hotel',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true, // HG must grant access to Mini Hotel LATAM org (53439)
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Mini Hotel Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Mini Hotel Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: MINI_HOTEL_PMS_ID,
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
