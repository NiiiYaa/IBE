import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const RATETIGER_PMS_ID = 23;

// RateTiger by eRevMax onboarding flow (KB-verified):
// Process:
// 1. Hotel contacts eRevMax support (support@erevmax.com) requesting HyperGuest connection
// 2. eRevMax sends hotel a HyperGuest content form to fill in
// 3. Once completed, eRevMax configuration team enables the HyperGuest channel
// 4. eRevMax emails HG Onboarding with the property ID when enabled
// 5. HG creates the property shell using that property ID
// Note: RateTiger support may ask for HG ID first, but they must provide property ID to HG first.
// requiresStaffChannelSetup: true — HG waits for email from RateTiger with property ID.
// Support: support@erevmax.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'request_ratetiger_connection',
      kind: 'user_action',
      title: 'Request HyperGuest Connection from RateTiger',
      description: 'Contact RateTiger / eRevMax support at support@erevmax.com and request the HyperGuest channel to be enabled for your property. They will send you a HyperGuest content form to fill in. Once submitted, RateTiger will process the activation and notify HyperGuest directly. Click Continue once you have submitted the content form to RateTiger.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm RateTiger Connection',
      description: 'HyperGuest will receive a confirmation email from RateTiger with your property ID once the channel is activated. Your HyperGuest contact will notify you when everything is set up and ARI is flowing. Click Continue when notified.',
    }
  );
  return steps;
}

export const rateTigerFlow = createVendorFlow({
  pmsId: RATETIGER_PMS_ID,
  pmsName: 'RateTiger by eRevMax',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Contact RateTiger to enable HyperGuest and complete the content form',
      instruction: 'Contact RateTiger / eRevMax support and request the HyperGuest channel to be enabled for your property. They will send you a HyperGuest content form — please fill it in and return it. Once submitted, RateTiger will activate the connection and notify HyperGuest directly.',
      contactEmail: 'support@erevmax.com',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({}), // Property ID provided by RateTiger to HG, not by hotel
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: RATETIGER_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // Property ID received from RateTiger email and set by HG staff in back-office
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
