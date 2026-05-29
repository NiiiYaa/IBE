import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const EXTRANETSYNC_PMS_ID = 166;

// Extranetsync onboarding flow (KB-verified, certified 16/10/25):
// - No credential needed for HG to create the shell (generic partner integration)
// - Property created manually in HG back-office
// - Extranetsync pushes ARI to HG
// - Rooms/rates are NOT retrieved from source — must be created manually in HG
// - Room/rate codes: Extranetsync uses HG's own IDs (no code matching required)
// - Children/infants NOT supported — treat all as adults
// - Support: connectivity@extranetsync.com, ankur@extranetsync.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Extranetsync',
    description: 'In your Extranetsync account, activate the HyperGuest channel using your HyperGuest property code. Extranetsync will begin pushing availability and rates automatically. Note: children and infants are not supported — all guests are treated as adults. Once done, click Continue.',
  });
  return steps;
}

export const extranetSyncFlow = createVendorFlow({
  pmsId: EXTRANETSYNC_PMS_ID,
  pmsName: 'Extranetsync',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({}), // No credential needed — Extranetsync uses HG's own property IDs
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: EXTRANETSYNC_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
