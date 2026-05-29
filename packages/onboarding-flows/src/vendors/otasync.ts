import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const OTASYNC_PMS_ID = 90;

// OTA Sync onboarding flow (KB-verified):
// 1. Hotel provides their OTA Sync account username and password
// 2. HG fetches static data from OTA Sync using those credentials
// 3. Room and rate codes must match between OTA Sync and HyperGuest
// requiresStaffChannelSetup: false
// Support: office@otasync.me, ilija@otasync.me

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in OTA Sync',
    description: 'HyperGuest will use your OTA Sync credentials to fetch your room and rate data. Room and rate codes must match between OTA Sync and HyperGuest. Once the channel is active, OTA Sync will push availability and rates automatically. Click Continue.',
  });
  return steps;
}

export const otaSyncFlow = createVendorFlow({
  pmsId: OTASYNC_PMS_ID,
  pmsName: 'OTA Sync',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({
    username: z.string().min(1, 'OTA Sync username required'),
    password: z.string().min(1, 'OTA Sync password required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['username']) return { valid: false, message: 'OTA Sync username is required' };
    if (!ctx.credentials['password']) return { valid: false, message: 'OTA Sync password is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: OTASYNC_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['username'],
        hasStaticData: true,
      },
    };
  },
});
