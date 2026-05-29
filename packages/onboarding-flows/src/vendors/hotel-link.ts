import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const HOTELLINK_PMS_ID = 57;

// Hotel Link onboarding flow (KB-verified):
// IMPORTANT: HyperGuest PULLS data from Hotel Link — Hotel Link does NOT push to HG.
// HG calls GetRatePlans API and GetInventory API to fetch rooms/rates.
// Process:
// 1. Hotel must first request HyperGuest activation from Hotel Link support
// 2. Hotel provides their Hotel Link property ID/credentials
// 3. HG creates the property shell
// 4. HG fetches rooms/rates via GetRatePlans + GetInventory API calls (done by HG staff)
// 5. HG performs RESET ARI in Connectivity module to pull current ARI from Hotel Link API
// 6. Room/rate codes are managed by Hotel Link (their own format — connection won't work without correct codes)
// 7. Content: collected via IBE harvesting in the wizard (replaces manual B.com URL enrichment)
// Note: if rooms/rates not fetched on creation, escalate to Tier 2
// Support: support@hotellinksolutions.com | Brazil: brazil@hotellinksolutions.com

function buildSteps() {
  const steps = defaultStepsFor('hg_pulls');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Confirm Hotel Link Connection',
    description: 'HyperGuest will fetch your room and rate information from Hotel Link using their API. Once your HyperGuest contact confirms the data has been retrieved and ARI is active, click Continue.',
  });
  return steps;
}

export const hotelLinkFlow = createVendorFlow({
  pmsId: HOTELLINK_PMS_ID,
  pmsName: 'Hotel Link',
  dataFlow: 'hg_pulls', // HG actively calls Hotel Link API to fetch rooms/rates
  requiresStaffChannelSetup: true,
  kbVerified: true, // HG staff runs GetRatePlans + GetInventory + RESET ARI
  regionAware: false,
  preActions: [
    {
      title: 'Request HyperGuest activation from Hotel Link',
      instruction: 'Contact Hotel Link support and request that HyperGuest be activated as a channel for your property. Once activated, share your Hotel Link Property ID with your HyperGuest contact.',
      contactEmail: 'support@hotellinksolutions.com',
    },
  ],
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Hotel Link Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Hotel Link Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: HOTELLINK_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: true, // HG pulls static data via API
      },
    };
  },
});
