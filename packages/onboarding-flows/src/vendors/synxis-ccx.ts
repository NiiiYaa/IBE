import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const SYNXIS_CCX_PMS_ID = 99;

// SynXis CCX onboarding flow (KB-verified):
// SynXis CCX is Sabre's channel gateway — technically powered by RateGain behind the scenes.
// NOT all SynXis customers use CCX — BD must confirm CCX is in use before onboarding.
// Process:
// 1. Hotel requests CCX connection from their Sabre Account Manager.
// 2. Sabre sends a PRS Excel form (CCX-PRS Form) to the hotel.
// 3. Hotel fills and submits the PRS form with:
//    - HyperGuest Property ID in the "Hotel Extranet" column
//    - Login/URL, API User ID, API Password columns → leave EMPTY (not required for HyperGuest)
// 4. RateGain sends an authorization email to HG Onboarding → HG replies "Yes, we authorize"
// 5. SynXis/RateGain connect and ARI begins flowing.
// Note: Hotel only interacts with Sabre — do NOT mention RateGain to the hotel.
// requiresStaffChannelSetup: true — HG must authorize the RateGain email.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'synxis_prs_form',
      kind: 'user_action',
      title: 'Request CCX Connection from Sabre',
      description: 'Contact your Sabre Account Manager and request a HyperGuest CCX connection. Sabre will send you a PRS form (Excel). Fill in your HyperGuest Property Code in the "Hotel Extranet" column — leave Login, API User ID, and API Password empty. Submit the form back to Sabre. Click Continue once submitted.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Wait for Connection Confirmation',
      description: 'HyperGuest will receive an authorization email and confirm the connection. Once your HyperGuest contact notifies you that ARI is flowing, click Continue.',
    }
  );
  return steps;
}

export const synxisCcxFlow = createVendorFlow({
  pmsId: SYNXIS_CCX_PMS_ID,
  pmsName: 'SynXis CCX',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Request CCX connection from your Sabre Account Manager',
      instruction: 'Contact your Sabre Account Manager and ask for a HyperGuest CCX connection. They will send you a PRS form (Excel file called CCX-PRS Form). Fill in your HyperGuest Property Code in the "Hotel Extranet" column — leave the Login, API User ID, and API Password columns empty (not required for HyperGuest). Submit the form back to Sabre.',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({}), // No credential from hotel; HG authorizes via RateGain email
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: SYNXIS_CCX_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // HyperGuest property ID is used in the PRS form — no hotel-provided credential
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
