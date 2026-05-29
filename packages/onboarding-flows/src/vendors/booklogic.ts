import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const BOOKLOGIC_PMS_ID = 68;

// BookLogic onboarding flow (KB-verified):
// 1. Hotel contacts BookLogic to enable the HyperGuest connection
// 2. BookLogic sends connection credentials directly to HyperGuest (onboarding@hyperguest.com)
// 3. HG completes the setup on their side using those credentials
// Note: Static data is pulled from BookLogic by HG.
// Note: Room and rate codes must match between BookLogic and HyperGuest.
// requiresStaffChannelSetup: true — credentials arrive via email to HG, not from the hotel.
// Support: support@booklogic.net

function buildSteps() {
  const steps = defaultStepsFor('blank');

  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'request_booklogic_connection',
      kind: 'user_action',
      title: 'Request HyperGuest Connection from BookLogic',
      description: 'Contact BookLogic support at support@booklogic.net and request the HyperGuest channel to be enabled. They will send the credentials directly to HyperGuest. Click Continue once you have made the request.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm BookLogic Connection',
      description: 'HyperGuest will complete the connection once BookLogic sends the credentials. Room and rate codes must match between BookLogic and HyperGuest. Click Continue when notified by HyperGuest that the connection is active.',
    }
  );
  return steps;
}

export const booklogicFlow = createVendorFlow({
  pmsId: BOOKLOGIC_PMS_ID,
  pmsName: 'BookLogic',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Contact BookLogic to enable HyperGuest connection',
      instruction: 'Contact BookLogic support at support@booklogic.net and request the HyperGuest channel to be enabled for your property. BookLogic will send the connection credentials directly to HyperGuest. Once done, HyperGuest will complete the setup on our side.',
      contactEmail: 'support@booklogic.net',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({}), // Credentials come via email to HG, not from hotel
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: BOOKLOGIC_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: true,
      },
    };
  },
});
