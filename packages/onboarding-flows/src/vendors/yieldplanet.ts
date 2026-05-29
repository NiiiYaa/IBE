import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const YIELDPLANET_PMS_ID = 16;

// YieldPlanet onboarding flow (KB-verified):
// Process:
// 1. Hotel requests HyperGuest channel activation from YieldPlanet support
//    (receiving the YieldPlanet ID does NOT mean it's activated — activation must be requested)
// 2. YieldPlanet enables HG internally and confirms
// 3. Hotel provides their YieldPlanet Property ID to HG
// 4. HG creates the property shell
// 5. After connection, YieldPlanet pushes all rooms and rate plans to HG automatically
// Note: Content collected via IBE harvesting in the wizard.
//       After connection, YieldPlanet also pushes room/rate plan structure to HG automatically.
// requiresStaffChannelSetup: true — HG must request activation from YieldPlanet support
//   if hotel has not already done so.
// Support: YieldPlanet support team (contacted via hotel's YieldPlanet account)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'yieldplanet_activation',
      kind: 'user_action',
      title: 'Request HyperGuest Activation in YieldPlanet',
      description: 'Contact YieldPlanet support and request HyperGuest to be activated as a channel for your property. Important: simply having your YieldPlanet Property ID is not enough — YieldPlanet must activate HyperGuest on their side first. Once they confirm the activation, click Continue.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm YieldPlanet Connection',
      description: 'Once HyperGuest has created your property profile, YieldPlanet will automatically push your rooms and rate plans. Your HyperGuest contact will notify you when everything is live. Click Continue when confirmed.',
    }
  );
  return steps;
}

export const yieldPlanetFlow = createVendorFlow({
  pmsId: YIELDPLANET_PMS_ID,
  pmsName: 'YieldPlanet',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Request HyperGuest activation from YieldPlanet',
      instruction: 'Contact YieldPlanet support and ask them to activate HyperGuest as a channel for your property. Important: having your YieldPlanet Property ID is not enough — the channel must be activated by YieldPlanet first. Once they confirm, share your YieldPlanet Property ID with HyperGuest.',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'YieldPlanet Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'YieldPlanet Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: YIELDPLANET_PMS_ID,
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
