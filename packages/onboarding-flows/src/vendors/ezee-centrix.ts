import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const EZEE_PMS_ID = 18;

// eZee onboarding flow (KB-verified):
// 1. Hotel provides their eZee Property ID
// 2. HG opens the channel in eZee using: XML User = eZee ID, XML Password = "sdfgsHDFGS%#SEyaehd", Channel hotel code = eZee ID
// 3. eZee sends an authentication code to the hotel
// 4. Hotel forwards auth code to HG to complete the connection
// IMPORTANT: eZee pushes tax-EXCLUSIVE rates only — taxes must always be set to "Added" (never "Included")

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  // After CM settings: hotel must wait for eZee auth code, then share it with HG
  steps.splice(triggerIdx, 0,
    {
      id: 'ezee_auth_code',
      kind: 'user_action',
      title: 'Share Your eZee Authentication Code',
      description: 'eZee Centrix will send an authentication code to your email. Please forward that code to your HyperGuest contact — we need it to complete the channel activation. Once you have shared it, click Continue.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm Connection in eZee Centrix',
      description: 'Once HyperGuest has processed your authentication code, log in to eZee Centrix and verify that the HyperGuest channel is shown as active. Then click Continue.',
    }
  );
  return steps;
}

export const ezeeCentrixFlow = createVendorFlow({
  pmsId: EZEE_PMS_ID,
  pmsName: 'eZee Centrix',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Receive your eZee Authentication Code',
      instruction: 'After HyperGuest activates your eZee channel, eZee Centrix will send an authentication code to your registered email address. Please forward that code to your HyperGuest contact — it is required to complete the connection.',
      contactEmail: 'cmtech@ezeetechnosys.com',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'eZee Property ID is required — this is your numeric hotel ID in eZee Centrix'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'eZee Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: EZEE_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId: ctx.credentials['propertyId'],
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
          // eZee always pushes tax-exclusive rates — taxes must be "Added" in HG config
          taxInclusive: false,
        },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
