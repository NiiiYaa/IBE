import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const CLOUDBEDS_PMS_ID = 88;

// Cloudbeds onboarding flow (KB-verified):
// Cloudbeds uses MyAllocator as the underlying channel manager.
// Process:
// 1. HG staff emails support@cloudbeds.com to enable HG and request the MyAllocator ID
// 2. HG creates the property using MyAllocator ID + password: HG_{PropertyName}1
//    (first letter of property name MUST be uppercase, e.g. HG_Socatelbariloche1)
// 3. Rooms are retrieved from Booking.com; 4 default rate plans created
// 4. No code matching needed between HG and Cloudbeds
// 5. Hotel connects in Cloudbeds using: HyperGuest Property ID + the password HG set
// requiresStaffChannelSetup: true — HG must email Cloudbeds before the wizard can proceed

function buildSteps() {
  const steps = defaultStepsFor('blank');
  // Remove collect_credentials — no hotel credential; HG handles this
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Cloudbeds',
    description: 'In your Cloudbeds account, go to Marketplace → Channels and locate HyperGuest (previously enabled by Cloudbeds support). Enter your HyperGuest Property ID and the password provided by your HyperGuest contact to complete the mapping. Once done, click Continue.',
  });
  return steps;
}

export const cloudbedsFlow = createVendorFlow({
  pmsId: CLOUDBEDS_PMS_ID,
  pmsName: 'Cloudbeds',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true, // HG must email Cloudbeds to get MyAllocator ID and enable the channel
  regionAware: false,
  credentialsSchema: z.object({}), // MyAllocator ID is obtained by HG staff, not the hotel
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: CLOUDBEDS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // MyAllocator ID is set by HG staff via the back-office after receiving it from Cloudbeds
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
