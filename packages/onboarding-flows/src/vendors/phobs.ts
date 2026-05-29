import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const PHOBS_PMS_ID = 100;

// Phobs onboarding flow (KB-verified, certified 25/02/25):
// HG uses fixed credentials for all Phobs properties:
//   Username: hyperguest_user
//   Password: hyperguest_password
// IMPORTANT: The property ID provided by the hotel must have "HG" prepended.
//   Example: hotel gives "12345" → HG enters "HG12345"
// - Hotel MUST enable HyperGuest in their Phobs account before HG can create the shell
// - Once created, HG pulls rooms and rateplans from Phobs automatically
// - Phobs then pushes ARI to HG
// - No mixing of per-room and per-occupancy pricing (HG shows lowest price; reset ARI if needed)
// - Hotels only — Campsites not yet supported
// - HG covers 1% commission to Phobs per reservation (commercial terms)
// Support: via Phobs portal / property's Phobs contact

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Confirm Phobs Connection',
    description: 'HyperGuest will activate the connection in Phobs using your property ID and the standard HyperGuest credentials. Once your HyperGuest contact confirms the rooms and rates have been pulled and ARI is active, click Continue.',
  });
  return steps;
}

export const phobsFlow = createVendorFlow({
  pmsId: PHOBS_PMS_ID,
  pmsName: 'Phobs',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true, // HG uses fixed credentials; must prepend "HG" to propertyId
  regionAware: false,
  kbVerified: true,
  preActions: [
    {
      title: 'Enable HyperGuest in your Phobs account',
      instruction: 'Before HyperGuest can create your property profile, you must first enable HyperGuest as a channel in your Phobs account. Contact your Phobs account manager or support to activate the HyperGuest connection for your property.',
    },
  ],
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Phobs Property ID is required (HyperGuest will prepend "HG" to this ID internally)'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Phobs Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    // IMPORTANT: Phobs requires "HG" prefix on the property ID
    const rawId = ctx.credentials['propertyId'] as string;
    const phobsId = rawId.startsWith('HG') ? rawId : `HG${rawId}`;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: PHOBS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: phobsId, pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: phobsId,
        hasStaticData: true, // HG pulls rooms/rateplans from Phobs on creation
      },
    };
  },
});
