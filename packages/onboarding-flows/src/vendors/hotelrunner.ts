import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const HOTELRUNNER_PMS_ID = 39;

// HotelRunner onboarding flow (KB-verified):
// HG has direct extranet access to HotelRunner partner portal.
// Process (all handled by HG staff):
// 1. HG logs into partner.hotelrunner.com (onboarding@hyperguest.com / 12345678)
// 2. Under Accommodation Network → Contact requests → Pending Sign up → find property
// 3. HG creates the shell in HG back-office using info from HotelRunner + OB notes
// 4. In HotelRunner extranet → property → Actions → Start Connection → enter HG Property ID
//    (Note: connection activation can take up to 5 minutes, do NOT refresh)
// 5. HotelRunner completes mapping within 24h → HG receives confirmation email
// 6. HG contacts hotel to confirm ARI and handle promotions/test bookings
// Pricing note: if rooms show mixed pricing models (per room + per person), select per person.
//   HotelRunner will fix per room ones from their side.
// Support: can@hotelrunner.com (include for mapping/ARI issues)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'HotelRunner Connection in Progress',
    description: 'HyperGuest is activating the connection in HotelRunner using your property code. HotelRunner typically completes the room and rate mapping within 24 hours. Your HyperGuest contact will notify you once ARI is flowing. Click Continue when notified.',
  });
  return steps;
}

export const hotelRunnerFlow = createVendorFlow({
  pmsId: HOTELRUNNER_PMS_ID,
  pmsName: 'HotelRunner',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true, // HG activates via HotelRunner extranet using HG property ID
  regionAware: false,
  credentialsSchema: z.object({}), // No hotel credential needed — HG handles connection via extranet
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: HOTELRUNNER_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // HG property ID is used in HotelRunner extranet to activate the connection
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
