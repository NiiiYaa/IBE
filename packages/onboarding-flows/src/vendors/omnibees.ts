import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const OMNIBEES_PMS_ID = 59;

// Omnibees onboarding flow (KB-verified):
// Process:
// 1. Hotel contacts Omnibees service desk: servicedesk@omnibees.com
//    and requests HyperGuest channel connection
// 2. Once Omnibees confirms, they provide HG with the property ID
//    (UUID format e.g. "43cb3ecb-9139-450a-ba2d-26a6c5181c83")
// 3. HG creates the property shell using that ID
// 4. Hotel provides "Codigos de Mapeio" (mapping codes) for rooms and rate plans
// IMPORTANT: Room and rate plan codes MUST match exactly between HG and Omnibees
// Support: servicedesk@omnibees.com (property issues) | integration.support@omnibees.com (general)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'request_omnibees_connection',
      kind: 'user_action',
      title: 'Request HyperGuest Connection from Omnibees',
      description: 'Contact Omnibees service desk at servicedesk@omnibees.com and request the HyperGuest channel to be activated for your property. Once Omnibees confirms and HyperGuest has received your property ID, click Continue.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm Omnibees Room & Rate Mapping',
      description: 'Share your Omnibees room and rate plan codes ("Codigos de Mapeio") with your HyperGuest contact — these must match exactly between Omnibees and HyperGuest for ARI to flow correctly. Once mapping is confirmed, click Continue.',
    }
  );
  return steps;
}

export const omnibeesFlow = createVendorFlow({
  pmsId: OMNIBEES_PMS_ID,
  pmsName: 'Omnibees',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Request HyperGuest connection from Omnibees',
      instruction: 'Contact Omnibees service desk and request the HyperGuest channel to be activated for your property. Also prepare your room and rate plan mapping codes ("Codigos de Mapeio") — these must match exactly between Omnibees and HyperGuest.',
      contactEmail: 'servicedesk@omnibees.com',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({}), // Property ID (UUID) received from Omnibees by HG staff, not the hotel
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: OMNIBEES_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // UUID-format property ID received from Omnibees and set by HG staff in back-office
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
