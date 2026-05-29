import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const AIOSELL_PMS_ID = 122;

// Aiosell onboarding flow (KB-verified):
// HG uses fixed credentials for all Aiosell properties:
//   Username: hyperguest
//   Password: 417cadd723a5d53a0719e3ad83b1283b200816aa6f2c9b0069dc42c2952878160ca25598f287e0dab235945e7f17643d491a2a5ee35bcc0896b016cf5042290b
// Content collected via IBE harvesting in the wizard.
// Support: support@aiosell.com | siddharth.goenka@vrsgroup.in

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Confirm Aiosell Connection',
    description: 'HyperGuest will activate the connection in Aiosell using your property ID and the standard HyperGuest credentials. Once your HyperGuest contact confirms the channel is active, click Continue.',
  });
  return steps;
}

export const aiosellFlow = createVendorFlow({
  pmsId: AIOSELL_PMS_ID,
  pmsName: 'Aiosell',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true, // HG uses fixed credentials (username: hyperguest, password: 417cadd...)
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Aiosell Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Aiosell Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: AIOSELL_PMS_ID,
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
